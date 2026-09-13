-- Ejecutar después de 001-004. Idempotente.
--
-- Tres cosas en este script:
-- 1) Restringe edición/eliminación de categorías, productos, movimientos y
--    facturas al owner (el auxiliar puede seguir creando movimientos y
--    facturas, pero ya no editarlos ni borrarlos; categorías/productos
--    quedan de solo lectura para el auxiliar).
-- 2) Límites parametrizables por organización: máximo de categorías y
--    máximo de productos por categoría (los define el super_admin, las
--    crea cada organización desde su propio Catálogo).
-- 3) Módulo nuevo "Ventas por Productos" (carrito con descuento de stock) y
--    su tabla `sales`, guardada en formato liviano (una fila por venta con
--    los productos en JSONB, no una tabla de líneas separada).

-- ==========================================================================
-- 1) Límites por organización
-- ==========================================================================
alter table organizations
  add column if not exists max_categorias int not null default 5,
  add column if not exists max_productos_por_categoria int not null default 50;

-- ==========================================================================
-- 2) Adjunto opcional en movimientos (Ventas y Gastos)
-- ==========================================================================
alter table movements
  add column if not exists file_path text;

-- ==========================================================================
-- 3) Restricciones de escritura: solo owner edita/elimina
-- ==========================================================================
drop policy if exists categories_write on categories;
create policy categories_write on categories for insert
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists categories_update on categories;
create policy categories_update on categories for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists categories_delete on categories;
create policy categories_delete on categories for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists products_insert on products;
create policy products_insert on products for insert
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists products_update on products;
create policy products_update on products for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists products_delete on products;
create policy products_delete on products for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');

-- movements: el auxiliar sigue pudiendo insertar (registrar ventas/gastos
-- del día), pero solo el owner puede editar o eliminar.
drop policy if exists movements_update on movements;
create policy movements_update on movements for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists movements_delete on movements;
create policy movements_delete on movements for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');

-- invoices: mismo criterio que movements.
drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists invoices_delete on invoices;
create policy invoices_delete on invoices for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');

-- ==========================================================================
-- 4) Módulo "Ventas por Productos" + tabla sales
--
-- El descuento de stock cuando el auxiliar vende desde el carrito NO pasa
-- por la política products_update de arriba (que sigue siendo solo-owner):
-- pasa por la función create_sale() de más abajo, que corre con
-- "security definer" (se salta RLS) y valida ella misma la organización.
-- ==========================================================================
insert into modules (key, name, description, price)
values (
  'ventas_productos',
  'Ventas por Productos',
  'Carrito de venta: selecciona productos, calcula el total y descuenta el inventario automáticamente.',
  0
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description;

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  items jsonb not null,
  total numeric(12, 2) not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists sales_organization_id_idx on sales (organization_id);

alter table sales enable row level security;

drop policy if exists sales_select on sales;
create policy sales_select on sales for select
  using (organization_id = current_profile_org() or is_super_admin());

-- Solo insert: la venta queda como registro fijo (ni owner ni auxiliar la
-- editan); para corregir un error se registra una nueva venta.
drop policy if exists sales_insert on sales;
create policy sales_insert on sales for insert
  with check (organization_id = current_profile_org());

-- create_sale(): valida stock, descuenta inventario y guarda la venta en
-- una sola transacción atómica (evita vender más unidades de las que hay
-- si dos personas venden el mismo producto al mismo tiempo). Se llama vía
-- supabase.rpc desde lib/actions/ventas-productos.ts; nunca se actualiza
-- `products.quantity` directamente desde el cliente para este flujo.
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
