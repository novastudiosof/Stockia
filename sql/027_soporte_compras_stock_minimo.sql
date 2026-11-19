-- 027: soporte (foto/PDF) de las compras y stock mínimo con alertas.
-- Ejecutar después de 026_compras_proveedores.sql. Se puede correr varias veces.

-- ==========================================================================
-- 1) Soporte de la factura del proveedor
-- ==========================================================================
alter table purchases add column if not exists file_path text;

-- Los soportes de compras van en el bucket privado "invoices", en la carpeta
-- "<organization_id>/compras/...". Esa carpeta es solo del administrador:
-- el auxiliar sigue viendo los adjuntos del resto del negocio, pero no los
-- de compras (costos y proveedores).
drop policy if exists invoices_bucket_select on storage.objects;
create policy invoices_bucket_select on storage.objects for select
  using (
    bucket_id = 'invoices'
    and (
      (
        (storage.foldername(name))[1] = current_profile_org()::text
        and (
          (storage.foldername(name))[2] is distinct from 'compras'
          or current_profile_role() = 'owner'
        )
      )
      or is_super_admin()
    )
  );

drop policy if exists invoices_bucket_insert on storage.objects;
create policy invoices_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = current_profile_org()::text
    and (
      (storage.foldername(name))[2] is distinct from 'compras'
      or current_profile_role() = 'owner'
    )
  );

-- (invoices_bucket_delete ya es solo del owner desde la 015.)

-- purchases no tiene política de update: el soporte se asigna por esta función.
create or replace function set_purchase_file(p_purchase_id uuid, p_file_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_old text;
begin
  if current_profile_role() is distinct from 'owner' then
    raise exception 'Solo el administrador puede manejar compras';
  end if;

  if p_file_path is not null and p_file_path not like v_org::text || '/compras/%' then
    raise exception 'Ruta de archivo inválida';
  end if;

  select file_path into v_old
  from purchases
  where id = p_purchase_id and organization_id = v_org
  for update;
  if not found then
    raise exception 'Compra no encontrada';
  end if;

  update purchases set file_path = p_file_path where id = p_purchase_id;
  return v_old;
end;
$$;

grant execute on function set_purchase_file(uuid, text) to authenticated;

-- ==========================================================================
-- 2) Stock mínimo
-- ==========================================================================
-- min_stock null = usa el mínimo general del negocio.
alter table products add column if not exists min_stock int;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_min_stock_check') then
    alter table products add constraint products_min_stock_check check (min_stock is null or min_stock >= 0);
  end if;
end $$;

alter table organizations
  add column if not exists stock_alerts_enabled boolean not null default true,
  add column if not exists default_min_stock int not null default 5;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_default_min_stock_check') then
    alter table organizations add constraint organizations_default_min_stock_check
      check (default_min_stock >= 0 and default_min_stock <= 100000);
  end if;
end $$;

-- Productos en o por debajo de su mínimo (o agotados). Es security invoker:
-- respeta RLS, así que al auxiliar no le llegan proveedor ni costo (las
-- compras solo las lee el administrador).
drop function if exists low_stock_products();
create or replace function low_stock_products()
returns table (
  product_id uuid,
  name text,
  barcode text,
  category_id uuid,
  category_name text,
  category_icon text,
  quantity int,
  min_stock int,
  own_min boolean,
  last_supplier_id uuid,
  last_supplier_name text,
  last_unit_cost numeric,
  last_purchase_date date
)
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select o.id, o.stock_alerts_enabled, o.default_min_stock
    from organizations o
    where o.id = current_profile_org()
  )
  select
    p.id,
    p.name,
    p.barcode,
    p.category_id,
    c.name,
    c.icon,
    p.quantity,
    coalesce(p.min_stock, org.default_min_stock),
    p.min_stock is not null,
    lp.supplier_id,
    lp.supplier_name,
    lp.unit_cost,
    lp.purchase_date
  from org
  join products p on p.organization_id = org.id
  join categories c on c.id = p.category_id
  left join lateral (
    select pu.supplier_id, pu.supplier_name, (e ->> 'unitCost')::numeric as unit_cost, pu.purchase_date
    from purchases pu
    cross join lateral jsonb_array_elements(pu.items) e
    where pu.organization_id = org.id
      and pu.voided_at is null
      and pu.supplier_id is not null
      and e ->> 'productId' = p.id::text
    order by pu.purchase_date desc, pu.created_at desc
    limit 1
  ) lp on true
  where org.stock_alerts_enabled
    and (p.quantity <= 0 or p.quantity <= coalesce(p.min_stock, org.default_min_stock))
  order by p.quantity <= 0 desc, p.quantity - coalesce(p.min_stock, org.default_min_stock), p.name;
$$;

grant execute on function low_stock_products() to authenticated;

create or replace function low_stock_count()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
  from products p
  join organizations o on o.id = p.organization_id
  where o.id = current_profile_org()
    and o.stock_alerts_enabled
    and (p.quantity <= 0 or p.quantity <= coalesce(p.min_stock, o.default_min_stock));
$$;

grant execute on function low_stock_count() to authenticated;
