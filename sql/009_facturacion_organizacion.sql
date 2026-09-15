-- Ejecutar después de 001-008. Idempotente.
--
-- 1) Datos de facturación/marca por organización (los configura el
--    super_admin desde /superadmin) + numeración correlativa de venta.
-- 2) Conecta las ventas con clientes: cada venta guarda tanto el
--    `customer_id` (para reutilizar el cliente en ventas futuras) como una
--    foto de sus datos en `customer_snapshot` en el momento de la venta —
--    así, si el cliente se edita o se borra después, la factura ya impresa
--    no cambia (mismo criterio que ya usa `sales.items` con los productos).
-- 3) create_sale() ahora acepta un cliente (existente o nuevo) y asigna el
--    número de venta correlativo de la organización.

-- ==========================================================================
-- 1) Datos de facturación de la organización
-- ==========================================================================
alter table organizations
  add column if not exists legal_name text,
  add column if not exists tax_id text,
  add column if not exists billing_address text,
  add column if not exists billing_phone text,
  add column if not exists billing_email text,
  add column if not exists invoice_footer text,
  add column if not exists currency text not null default 'COP',
  add column if not exists invoice_prefix text not null default 'FAC-',
  add column if not exists next_sale_number int not null default 1,
  add column if not exists logo_url text;

-- Bucket público para logos (no son datos sensibles, a diferencia de
-- "invoices"): así la factura impresa puede mostrar el logo sin necesitar
-- una URL firmada.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists branding_bucket_select on storage.objects;
create policy branding_bucket_select on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists branding_bucket_insert on storage.objects;
create policy branding_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = current_profile_org()::text
    and is_super_admin()
  );

drop policy if exists branding_bucket_delete on storage.objects;
create policy branding_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'branding'
    and (storage.foldername(name))[1] = current_profile_org()::text
    and is_super_admin()
  );

-- ==========================================================================
-- 2) sales: cliente + numeración
-- ==========================================================================
alter table sales
  add column if not exists customer_id uuid references clientes (id) on delete set null,
  add column if not exists customer_snapshot jsonb,
  add column if not exists sale_number int;

create index if not exists sales_customer_id_idx on sales (customer_id);

-- ==========================================================================
-- 3) create_sale(): agrega cliente (existente o nuevo) + numeración.
-- Cambia de firma (2 args -> 4 args con default), así que se elimina la
-- versión anterior explícitamente para no dejar dos funciones sobrecargadas.
-- ==========================================================================
drop function if exists create_sale(uuid, jsonb);

create or replace function create_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_customer_data jsonb default null
)
returns table (sale_id uuid, total numeric, sale_number int)
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
  v_customer clientes%rowtype;
  v_customer_id uuid := p_customer_id;
  v_customer_snapshot jsonb;
  v_sale_number int;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  if v_customer_id is not null then
    select * into v_customer from clientes
      where id = v_customer_id and organization_id = p_organization_id
      for update;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  elsif p_customer_data is not null and coalesce(trim(p_customer_data->>'nombre'), '') <> '' then
    insert into clientes (organization_id, nombre, documento, telefono, email, direccion)
    values (
      p_organization_id,
      trim(p_customer_data->>'nombre'),
      nullif(trim(p_customer_data->>'documento'), ''),
      nullif(trim(p_customer_data->>'telefono'), ''),
      nullif(trim(p_customer_data->>'email'), ''),
      nullif(trim(p_customer_data->>'direccion'), '')
    )
    returning * into v_customer;
    v_customer_id := v_customer.id;
  end if;

  if v_customer_id is not null then
    v_customer_snapshot := jsonb_build_object(
      'nombre', v_customer.nombre,
      'documento', v_customer.documento,
      'telefono', v_customer.telefono,
      'email', v_customer.email,
      'direccion', v_customer.direccion
    );
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

  update organizations set next_sale_number = next_sale_number + 1
    where id = p_organization_id
    returning next_sale_number - 1 into v_sale_number;

  insert into sales (organization_id, items, total, created_by, customer_id, customer_snapshot, sale_number)
  values (p_organization_id, v_items_out, v_total, auth.uid(), v_customer_id, v_customer_snapshot, v_sale_number)
  returning id into v_sale_id;

  return query select v_sale_id, v_total, v_sale_number;
end;
$$;

grant execute on function create_sale(uuid, jsonb, uuid, jsonb) to authenticated;
