-- Ejecutar después de 001-016. Idempotente.
--
-- 1) ventas_gastos_feed(): lista unificada para el informe "Ventas y Gastos".
--    La pantalla de Ventas y Gastos muestra los movimientos manuales MÁS las
--    ventas del carrito (agrupadas por día); el informe solo traía los
--    movimientos. Esta función las une con paginación por cursor (día, clave).
-- 2) sales.public_token: identificador aleatorio e imposible de adivinar para
--    compartir la factura por WhatsApp con un enlace (/factura/<token>), sin
--    exigir inicio de sesión al cliente.

-- ==========================================================================
-- 1) Listado unificado de ventas y gastos
-- ==========================================================================
create or replace function ventas_gastos_feed(
  p_from date,
  p_to date,
  p_after_day date default null,
  p_after_key text default null,
  p_limit int default 25
)
returns table (
  day date,
  key text,
  kind text,
  concept text,
  description text,
  amount numeric,
  sales_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := case when p_from is null then null
                              else p_from::timestamp at time zone 'America/Bogota' end;
  v_end timestamptz := case when p_to is null then null
                            else (p_to + 1)::timestamp at time zone 'America/Bogota' end;
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;

  return query
  select f.d, f.k, f.knd, f.cpt, f.dsc, f.amt, f.cnt
  from (
    select m.occurred_at as d,
           m.id::text as k,
           m.type as knd,
           m.concept as cpt,
           m.description as dsc,
           m.amount as amt,
           null::int as cnt
      from movements m
     where m.organization_id = v_org
       and (p_from is null or m.occurred_at >= p_from)
       and (p_to is null or m.occurred_at <= p_to)
    union all
    select x.d,
           'sales-' || x.d::text,
           'venta_productos',
           'Ventas por productos',
           null::text,
           sum(x.total),
           count(*)::int
      from (
        select org_local_date(s.created_at) as d, s.total
          from sales s
         where s.organization_id = v_org
           and s.voided_at is null
           and (v_start is null or s.created_at >= v_start)
           and (v_end is null or s.created_at < v_end)
      ) x
     group by x.d
  ) f
  where p_after_day is null or (f.d, f.k) < (p_after_day, p_after_key)
  order by f.d desc, f.k desc
  limit least(greatest(coalesce(p_limit, 25), 1), 101);
end;
$$;

grant execute on function ventas_gastos_feed(date, date, date, text, int) to authenticated;

-- Total de filas del listado (para "Mostrando X de N").
create or replace function ventas_gastos_feed_count(p_from date, p_to date)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := case when p_from is null then null
                              else p_from::timestamp at time zone 'America/Bogota' end;
  v_end timestamptz := case when p_to is null then null
                            else (p_to + 1)::timestamp at time zone 'America/Bogota' end;
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;

  return (
    select count(*) from movements m
     where m.organization_id = v_org
       and (p_from is null or m.occurred_at >= p_from)
       and (p_to is null or m.occurred_at <= p_to)
  ) + (
    select count(distinct org_local_date(s.created_at)) from sales s
     where s.organization_id = v_org
       and s.voided_at is null
       and (v_start is null or s.created_at >= v_start)
       and (v_end is null or s.created_at < v_end)
  );
end;
$$;

grant execute on function ventas_gastos_feed_count(date, date) to authenticated;

-- ==========================================================================
-- 2) Enlace público de factura
-- ==========================================================================
alter table sales
  add column if not exists public_token uuid not null default gen_random_uuid();

create unique index if not exists sales_public_token_idx on sales (public_token);
