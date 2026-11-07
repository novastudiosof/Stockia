-- Ejecutar después de 001-017. Idempotente.
--
-- Corrige profit_by_product(): sum(bigint) devuelve numeric, pero la función
-- declaraba la columna "units" como bigint y Postgres rechazaba la consulta
-- ("structure of query does not match function result type"). Como la
-- pantalla de Utilidad pide el resumen, los productos y la serie a la vez, ese
-- error hacía fallar todo el cálculo.

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
