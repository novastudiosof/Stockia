-- Ejecutar después de 001-015. Idempotente.
--
-- Informes: consulta paginada de ventas y utilidad (módulo "informes").
--
-- 1) Costo congelado por línea de venta: cada item de sales.items guarda
--    'unitCost' (precio de compra del producto al momento de vender). Se
--    llena con un trigger BEFORE INSERT, así no hay que reescribir
--    create_sale() y sigue funcionando aunque esa función cambie. La utilidad
--    de una venta no cambia si después se edita el precio de compra.
--    Las ventas anteriores se completan con el precio de compra ACTUAL del
--    producto (es una estimación; no existe el dato histórico real).
-- 2) Funciones de agregación (utilidad por rango, por producto y por periodo):
--    el cálculo ocurre en la base de datos, no se traen filas a la aplicación.
-- 3) Índices para que la búsqueda por cliente/fecha escale con muchas ventas.

-- ==========================================================================
-- 1) Costo por línea
-- ==========================================================================
create or replace function sales_snapshot_costs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(
    jsonb_agg(
      case
        when t.item ? 'unitCost' then t.item
        else t.item || jsonb_build_object(
          'unitCost',
          coalesce((
            select p.purchase_price from products p
             where p.id = (t.item->>'productId')::uuid
               and p.organization_id = new.organization_id
          ), 0)
        )
      end
      order by t.ord
    ),
    '[]'::jsonb
  )
  into new.items
  from jsonb_array_elements(new.items) with ordinality as t(item, ord);

  return new;
end;
$$;

drop trigger if exists sales_snapshot_costs_trg on sales;
create trigger sales_snapshot_costs_trg
  before insert on sales
  for each row execute function sales_snapshot_costs();

-- Ventas existentes: costo estimado con el precio de compra actual.
update sales s
   set items = (
     select coalesce(
       jsonb_agg(
         case
           when t.item ? 'unitCost' then t.item
           else t.item || jsonb_build_object(
             'unitCost',
             coalesce((
               select p.purchase_price from products p
                where p.id = (t.item->>'productId')::uuid
                  and p.organization_id = s.organization_id
             ), 0)
           )
         end
         order by t.ord
       ),
       '[]'::jsonb
     )
     from jsonb_array_elements(s.items) with ordinality as t(item, ord)
   )
 where exists (
   select 1 from jsonb_array_elements(s.items) i where not (i ? 'unitCost')
 );

-- ==========================================================================
-- 2) Utilidad (solo owner de la organización)
-- ==========================================================================
create or replace function profit_summary(p_from date, p_to date)
returns table (
  sales_count int,
  revenue numeric,
  cost numeric,
  gross_profit numeric,
  manual_sales numeric,
  expenses numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := p_from::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Bogota';
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;

  return query
  with s as (
    select id, total, items from sales
     where organization_id = v_org
       and voided_at is null
       and created_at >= v_start and created_at < v_end
  ),
  c as (
    select coalesce(sum(
      (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)
    ), 0) as cost
    from s, jsonb_array_elements(s.items) i
  )
  select
    (select count(*)::int from s),
    (select coalesce(sum(total), 0) from s),
    c.cost,
    (select coalesce(sum(total), 0) from s) - c.cost,
    (select coalesce(sum(amount), 0) from movements
      where organization_id = v_org and type = 'venta'
        and occurred_at between p_from and p_to),
    (select coalesce(sum(amount), 0) from movements
      where organization_id = v_org and type = 'gasto'
        and occurred_at between p_from and p_to)
  from c;
end;
$$;

grant execute on function profit_summary(date, date) to authenticated;

create or replace function profit_by_product(p_from date, p_to date, p_limit int default 20)
returns table (
  product_id uuid,
  name text,
  units bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := p_from::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Bogota';
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;

  return query
  select
    (i->>'productId')::uuid,
    max(i->>'name'),
    sum((i->>'quantity')::bigint)::bigint,
    sum((i->>'subtotal')::numeric),
    sum((i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)),
    sum((i->>'subtotal')::numeric)
      - sum((i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0))
  from sales s, jsonb_array_elements(s.items) i
  where s.organization_id = v_org
    and s.voided_at is null
    and s.created_at >= v_start and s.created_at < v_end
  group by (i->>'productId')::uuid
  order by 6 desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

grant execute on function profit_by_product(date, date, int) to authenticated;

-- Serie por día o por mes (p_group = 'day' | 'month'), tope de 400 puntos.
create or replace function profit_by_period(p_from date, p_to date, p_group text default 'day')
returns table (
  period date,
  revenue numeric,
  cost numeric,
  profit numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := p_from::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (p_to + 1)::timestamp at time zone 'America/Bogota';
  v_unit text := case when p_group = 'month' then 'month' else 'day' end;
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Rango de fechas inválido';
  end if;

  return query
  select
    date_trunc(v_unit, s.created_at at time zone 'America/Bogota')::date as period,
    sum(s.total),
    sum(x.cost),
    sum(s.total) - sum(x.cost)
  from sales s
  cross join lateral (
    select coalesce(sum(
      (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)
    ), 0) as cost
    from jsonb_array_elements(s.items) i
  ) x
  where s.organization_id = v_org
    and s.voided_at is null
    and s.created_at >= v_start and s.created_at < v_end
  group by 1
  order by 1 desc
  limit 400;
end;
$$;

grant execute on function profit_by_period(date, date, text) to authenticated;

-- ==========================================================================
-- 3) Índices para la búsqueda de ventas y movimientos
-- ==========================================================================
create extension if not exists pg_trgm with schema extensions;

create index if not exists sales_customer_name_trgm_idx
  on sales using gin ((customer_snapshot->>'nombre') extensions.gin_trgm_ops);
create index if not exists sales_customer_doc_trgm_idx
  on sales using gin ((customer_snapshot->>'documento') extensions.gin_trgm_ops);

-- Paginación por cursor (created_at, id) dentro de una organización.
create index if not exists sales_org_created_id_idx
  on sales (organization_id, created_at desc, id desc);

create index if not exists movements_org_day_idx
  on movements (organization_id, occurred_at desc, id desc);

create index if not exists products_org_name_idx
  on products (organization_id, name, id);
