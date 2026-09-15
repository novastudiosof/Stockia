-- Ejecutar después de 001-007. Idempotente.
--
-- Historial auditable de cambios de stock. Hasta ahora `products.quantity`
-- se sobrescribía directamente al editar un producto, sin dejar rastro de
-- cuánto cambió ni por qué. De aquí en adelante:
-- - Los ajustes manuales pasan por adjust_stock() (motivo obligatorio, no
--   permite dejar el stock en negativo, bloquea la fila para evitar carreras
--   con una venta simultánea).
-- - Las ventas (create_sale) y sus anulaciones (void_sale) también quedan
--   registradas aquí, así el ledger es una sola fuente de verdad.
-- - La carga inicial de un producto nuevo (createProduct, en la aplicación)
--   inserta su propio movimiento 'initial' directamente, sin pasar por una
--   función: no hay riesgo de carrera sobre una fila que se acaba de crear.

create table if not exists stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  delta int not null,
  previous_quantity int not null,
  new_quantity int not null,
  reason text,
  source text not null check (source in ('initial', 'manual', 'sale', 'void', 'import')),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_organization_id_idx on stock_movements (organization_id);
create index if not exists stock_movements_product_id_idx on stock_movements (product_id);

alter table stock_movements enable row level security;

drop policy if exists stock_movements_select on stock_movements;
create policy stock_movements_select on stock_movements for select
  using (organization_id = current_profile_org() or is_super_admin());

-- Único insert directo permitido desde el cliente: la carga inicial al crear
-- un producto. Los demás orígenes ('manual', 'sale', 'void', 'import') solo
-- se insertan desde funciones security definer, que se saltan RLS.
drop policy if exists stock_movements_insert on stock_movements;
create policy stock_movements_insert on stock_movements for insert
  with check (
    organization_id = current_profile_org()
    and current_profile_role() = 'owner'
    and source = 'initial'
  );

-- adjust_stock(): único camino para cambiar el stock a mano. Exige un motivo,
-- bloquea la fila del producto (evita que choque con una venta simultánea) y
-- no permite dejar el stock en negativo.
create or replace function adjust_stock(
  p_organization_id uuid,
  p_product_id uuid,
  p_delta int,
  p_reason text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products%rowtype;
  v_new_quantity int;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede ajustar el stock';
  end if;

  if p_delta = 0 then
    raise exception 'El ajuste debe ser distinto de cero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Debes indicar un motivo para el ajuste';
  end if;

  select * into v_product from products
    where id = p_product_id and organization_id = p_organization_id
    for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  v_new_quantity := v_product.quantity + p_delta;
  if v_new_quantity < 0 then
    raise exception 'El ajuste dejaría el stock en negativo (actual: %)', v_product.quantity;
  end if;

  update products set quantity = v_new_quantity where id = p_product_id;

  insert into stock_movements
    (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
  values
    (p_organization_id, p_product_id, p_delta, v_product.quantity, v_new_quantity, trim(p_reason), 'manual', auth.uid());

  return v_new_quantity;
end;
$$;

grant execute on function adjust_stock(uuid, uuid, int, text) to authenticated;

-- create_sale/void_sale: misma lógica de 005/006, sumando el registro del
-- movimiento de stock correspondiente ('sale' / 'void').
create or replace function create_sale(p_organization_id uuid, p_items jsonb)
returns table (sale_id uuid, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product products%rowtype;
  v_total numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_qty int;
  v_items_out jsonb := '[]'::jsonb;
  v_sale_id uuid;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;

    select * into v_product from products
      where id = (v_item->>'productId')::uuid
        and organization_id = p_organization_id
      for update;

    if not found then
      raise exception 'Producto no encontrado';
    end if;

    if v_product.quantity < v_qty then
      raise exception 'Stock insuficiente para "%": quedan %', v_product.name, v_product.quantity;
    end if;

    update products set quantity = quantity - v_qty where id = v_product.id;

    insert into stock_movements
      (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
    values
      (p_organization_id, v_product.id, -v_qty, v_product.quantity, v_product.quantity - v_qty, 'Venta', 'sale', auth.uid());

    v_line_total := v_product.sale_price * v_qty;
    v_total := v_total + v_line_total;

    v_items_out := v_items_out || jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'unitPrice', v_product.sale_price,
      'quantity', v_qty,
      'subtotal', v_line_total
    );
  end loop;

  insert into sales (organization_id, items, total, created_by)
  values (p_organization_id, v_items_out, v_total, auth.uid())
  returning id into v_sale_id;

  return query select v_sale_id, v_total;
end;
$$;

grant execute on function create_sale(uuid, jsonb) to authenticated;

create or replace function void_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
begin
  select * into v_sale from sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede anular una venta';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'Esta venta ya fue anulada';
  end if;

  for v_item in select * from jsonb_array_elements(v_sale.items)
  loop
    v_qty := (v_item->>'quantity')::int;

    select * into v_product from products
      where id = (v_item->>'productId')::uuid
      for update;

    if found then
      update products set quantity = quantity + v_qty where id = v_product.id;

      insert into stock_movements
        (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
      values
        (v_sale.organization_id, v_product.id, v_qty, v_product.quantity, v_product.quantity + v_qty, 'Anulación de venta', 'void', auth.uid());
    end if;
  end loop;

  update sales
    set voided_at = now(), voided_by = auth.uid()
    where id = p_sale_id;
end;
$$;

grant execute on function void_sale(uuid) to authenticated;
