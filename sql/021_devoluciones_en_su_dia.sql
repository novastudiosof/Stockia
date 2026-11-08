-- Ejecutar después de 001-020. Idempotente.
--
-- Devoluciones que se descuentan EN EL DÍA EN QUE SE HACEN, sin tocar el día
-- original de la venta:
--   - Una venta devuelta sigue contando en su día original (su cierre de caja,
--     ventas y utilidad no cambian).
--   - La devolución resta en el día en que se registra, por el mismo medio de
--     pago con el que se cobró la venta (efectivo / Nequi / Daviplata / Llave).
--   - Las anulaciones NO cambian: siguen excluyéndose por completo y solo se
--     permiten antes del cierre de caja del día de la venta.
--   - Se puede devolver una venta de un día ya cerrado. Lo único que se pide es
--     que la caja del día de HOY (donde se descuenta) no esté cerrada.

-- ==========================================================================
-- 1) Efectos de ventas y devoluciones en un rango de tiempo
--    sign = 1  : venta que cuenta (no anulada), en su fecha de venta.
--    sign = -1 : devolución, en la fecha en que se devolvió.
--    Función interna: recibe la organización, por eso no se expone a usuarios.
-- ==========================================================================
create or replace function sales_effects(
  p_org uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  sale_id uuid,
  effect_at timestamptz,
  sign int,
  total numeric,
  items jsonb,
  pay_cash numeric,
  pay_nequi numeric,
  pay_daviplata numeric,
  pay_llave numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.created_at, 1, s.total::numeric, s.items,
         s.pay_cash::numeric, s.pay_nequi::numeric, s.pay_daviplata::numeric, s.pay_llave::numeric
    from sales s
   where s.organization_id = p_org
     and (s.voided_at is null or s.void_kind = 'devolucion')
     and (p_start is null or s.created_at >= p_start)
     and (p_end is null or s.created_at < p_end)
  union all
  select s.id, s.voided_at, -1, s.total::numeric, s.items,
         s.pay_cash::numeric, s.pay_nequi::numeric, s.pay_daviplata::numeric, s.pay_llave::numeric
    from sales s
   where s.organization_id = p_org
     and s.void_kind = 'devolucion'
     and s.voided_at is not null
     and (p_start is null or s.voided_at >= p_start)
     and (p_end is null or s.voided_at < p_end)
$$;

revoke all on function sales_effects(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ==========================================================================
-- 2) Cierre de caja: columnas de devoluciones
-- ==========================================================================
alter table cash_days
  add column if not exists returns_cash numeric(12, 2) not null default 0,
  add column if not exists returns_nequi numeric(12, 2) not null default 0,
  add column if not exists returns_daviplata numeric(12, 2) not null default 0,
  add column if not exists returns_llave numeric(12, 2) not null default 0;

drop function if exists cash_day_summary(date);

create or replace function cash_day_summary(p_day date)
returns table (
  sales_count int,
  sales_total numeric,
  sales_cash numeric,
  sales_nequi numeric,
  sales_daviplata numeric,
  sales_llave numeric,
  manual_sales numeric,
  expenses numeric,
  returns_count int,
  returns_total numeric,
  returns_cash numeric,
  returns_nequi numeric,
  returns_daviplata numeric,
  returns_llave numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_start timestamptz := p_day::timestamp at time zone 'America/Bogota';
  v_end timestamptz := (p_day + 1)::timestamp at time zone 'America/Bogota';
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;

  return query
  with e as (select * from sales_effects(v_org, v_start, v_end))
  select
    (select count(*)::int from e where e.sign = 1),
    (select coalesce(sum(e.total), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_cash), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_nequi), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_daviplata), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_llave), 0) from e where e.sign = 1),
    (select coalesce(sum(m.amount), 0) from movements m
      where m.organization_id = v_org and m.type = 'venta' and m.occurred_at = p_day),
    (select coalesce(sum(m.amount), 0) from movements m
      where m.organization_id = v_org and m.type = 'gasto' and m.occurred_at = p_day),
    (select count(*)::int from e where e.sign = -1),
    (select coalesce(sum(e.total), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_cash), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_nequi), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_daviplata), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_llave), 0) from e where e.sign = -1);
end;
$$;

grant execute on function cash_day_summary(date) to authenticated;

create or replace function close_cash_day(p_day date, p_counted numeric, p_notes text default null)
returns cash_days
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_base numeric(12, 2) := 0;
  v_cash numeric(12, 2);
  v_nequi numeric(12, 2);
  v_dav numeric(12, 2);
  v_llave numeric(12, 2);
  v_manual numeric(12, 2);
  v_expenses numeric(12, 2);
  v_ret_cash numeric(12, 2);
  v_ret_nequi numeric(12, 2);
  v_ret_dav numeric(12, 2);
  v_ret_llave numeric(12, 2);
  v_expected numeric(12, 2);
  v_name text;
  v_row cash_days%rowtype;
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede cerrar la caja';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'El efectivo contado no puede ser negativo';
  end if;
  if p_day > org_local_date(now()) then
    raise exception 'No se puede cerrar un día futuro';
  end if;
  if exists (
    select 1 from cash_days
     where organization_id = v_org and day = p_day and closed_at is not null
  ) then
    raise exception 'Ese día ya está cerrado';
  end if;

  select coalesce(base_amount, 0) into v_base
    from cash_days where organization_id = v_org and day = p_day;
  v_base := coalesce(v_base, 0);

  select sm.sales_cash, sm.sales_nequi, sm.sales_daviplata, sm.sales_llave,
         sm.manual_sales, sm.expenses,
         sm.returns_cash, sm.returns_nequi, sm.returns_daviplata, sm.returns_llave
    into v_cash, v_nequi, v_dav, v_llave, v_manual, v_expenses,
         v_ret_cash, v_ret_nequi, v_ret_dav, v_ret_llave
    from cash_day_summary(p_day) sm;

  -- Las ventas/gastos manuales no registran método de pago: se asumen en
  -- efectivo. Las devoluciones en efectivo salen de la caja.
  v_expected := v_base + v_cash - v_ret_cash + v_manual - v_expenses;

  select full_name into v_name from profiles where id = auth.uid();

  insert into cash_days (
    organization_id, day, base_amount, closed_at, closed_by, closed_by_name,
    sales_cash, sales_nequi, sales_daviplata, sales_llave,
    returns_cash, returns_nequi, returns_daviplata, returns_llave,
    manual_sales, expenses, expected_cash, counted_cash, difference, notes
  )
  values (
    v_org, p_day, v_base, now(), auth.uid(), v_name,
    v_cash, v_nequi, v_dav, v_llave,
    v_ret_cash, v_ret_nequi, v_ret_dav, v_ret_llave,
    v_manual, v_expenses, v_expected, p_counted, p_counted - v_expected,
    nullif(trim(coalesce(p_notes, '')), '')
  )
  on conflict (organization_id, day) do update set
    closed_at = excluded.closed_at,
    closed_by = excluded.closed_by,
    closed_by_name = excluded.closed_by_name,
    sales_cash = excluded.sales_cash,
    sales_nequi = excluded.sales_nequi,
    sales_daviplata = excluded.sales_daviplata,
    sales_llave = excluded.sales_llave,
    returns_cash = excluded.returns_cash,
    returns_nequi = excluded.returns_nequi,
    returns_daviplata = excluded.returns_daviplata,
    returns_llave = excluded.returns_llave,
    manual_sales = excluded.manual_sales,
    expenses = excluded.expenses,
    expected_cash = excluded.expected_cash,
    counted_cash = excluded.counted_cash,
    difference = excluded.difference,
    notes = excluded.notes
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function close_cash_day(date, numeric, text) to authenticated;

create or replace function reopen_cash_day(p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede reabrir la caja';
  end if;

  update cash_days
     set closed_at = null, closed_by = null, closed_by_name = null,
         sales_cash = 0, sales_nequi = 0, sales_daviplata = 0, sales_llave = 0,
         returns_cash = 0, returns_nequi = 0, returns_daviplata = 0, returns_llave = 0,
         manual_sales = 0, expenses = 0, expected_cash = 0,
         counted_cash = null, difference = null, notes = null
   where organization_id = v_org and day = p_day;
end;
$$;

grant execute on function reopen_cash_day(date) to authenticated;

-- ==========================================================================
-- 3) void_sale(): la devolución se permite aunque el día de la venta esté
--    cerrado; exige que la caja de HOY (donde se descuenta) esté abierta.
-- ==========================================================================
create or replace function void_sale(
  p_sale_id uuid,
  p_kind text default 'anulacion',
  p_reason text default null
)
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
  v_label text;
begin
  if p_kind not in ('anulacion', 'devolucion') then
    raise exception 'Tipo inválido';
  end if;
  v_label := case when p_kind = 'devolucion' then 'Devolución' else 'Anulación' end;

  select * into v_sale from sales where id = p_sale_id for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_sale.organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede anular o devolver una venta';
  end if;

  if v_sale.voided_at is not null then
    raise exception 'Esta venta ya fue anulada o devuelta';
  end if;

  if p_kind = 'anulacion' then
    if exists (
      select 1 from cash_days
       where organization_id = v_sale.organization_id
         and day = org_local_date(v_sale.created_at)
         and closed_at is not null
    ) then
      raise exception 'El día de esta venta ya tiene cierre de caja; reábrelo para poder anularla';
    end if;
  else
    if exists (
      select 1 from cash_days
       where organization_id = v_sale.organization_id
         and day = org_local_date(now())
         and closed_at is not null
    ) then
      raise exception 'La caja de hoy ya está cerrada; reábrela para registrar la devolución (se descuenta en el día de hoy)';
    end if;
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
        (v_sale.organization_id, v_product.id, v_qty, v_product.quantity, v_product.quantity + v_qty,
         v_label || ' de venta', 'void', auth.uid());
    end if;
  end loop;

  update sales
    set voided_at = now(),
        voided_by = auth.uid(),
        void_kind = p_kind,
        void_reason = nullif(trim(coalesce(p_reason, '')), '')
    where id = p_sale_id;
end;
$$;

grant execute on function void_sale(uuid, text, text) to authenticated;

-- ==========================================================================
-- 4) Listados: ventas por día y feed de "Ventas y Gastos" (netos de devoluciones)
-- ==========================================================================
drop function if exists daily_sales();

create or replace function daily_sales()
returns table (day date, sales_count int, total numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
begin
  if v_org is null then
    return;
  end if;

  return query
  select org_local_date(e.effect_at),
         (count(*) filter (where e.sign = 1))::int,
         coalesce(sum(e.total * e.sign), 0)
    from sales_effects(v_org, null, null) e
   group by 1
   order by 1 desc;
end;
$$;

grant execute on function daily_sales() to authenticated;

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
           sum(x.amt),
           (count(*) filter (where x.sg = 1))::int
      from (
        select org_local_date(e.effect_at) as d, e.total * e.sign as amt, e.sign as sg
          from sales_effects(v_org, v_start, v_end) e
      ) x
     group by x.d
  ) f
  where p_after_day is null or (f.d, f.k) < (p_after_day, p_after_key)
  order by f.d desc, f.k desc
  limit least(greatest(coalesce(p_limit, 25), 1), 101);
end;
$$;

grant execute on function ventas_gastos_feed(date, date, date, text, int) to authenticated;

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
    select count(distinct org_local_date(e.effect_at))
      from sales_effects(v_org, v_start, v_end) e
  );
end;
$$;

grant execute on function ventas_gastos_feed_count(date, date) to authenticated;

-- ==========================================================================
-- 5) Utilidad: ventas en su día, devoluciones restando en el día en que se hacen
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
    select * from sales_effects(v_org, v_start, v_end)
  ),
  c as (
    select coalesce(sum(
      s.sign * (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)
    ), 0) as cost
    from s, jsonb_array_elements(s.items) i
  )
  select
    (select (count(*) filter (where s.sign = 1) - count(*) filter (where s.sign = -1))::int from s),
    (select coalesce(sum(s.total * s.sign), 0) from s),
    c.cost,
    (select coalesce(sum(s.total * s.sign), 0) from s) - c.cost,
    (select coalesce(sum(m.amount), 0) from movements m
      where m.organization_id = v_org and m.type = 'venta'
        and m.occurred_at between p_from and p_to),
    (select coalesce(sum(m.amount), 0) from movements m
      where m.organization_id = v_org and m.type = 'gasto'
        and m.occurred_at between p_from and p_to)
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
    sum(e.sign * (i->>'quantity')::bigint)::bigint,
    sum(e.sign * (i->>'subtotal')::numeric),
    sum(e.sign * (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)),
    sum(e.sign * (i->>'subtotal')::numeric)
      - sum(e.sign * (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0))
  from sales_effects(v_org, v_start, v_end) e, jsonb_array_elements(e.items) i
  group by (i->>'productId')::uuid
  having sum(e.sign * (i->>'quantity')::bigint) <> 0
  order by 6 desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;

grant execute on function profit_by_product(date, date, int) to authenticated;

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
    date_trunc(v_unit, e.effect_at at time zone 'America/Bogota')::date as period,
    sum(e.total * e.sign),
    sum(e.sign * x.cost),
    sum(e.total * e.sign) - sum(e.sign * x.cost)
  from sales_effects(v_org, v_start, v_end) e
  cross join lateral (
    select coalesce(sum(
      (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)
    ), 0) as cost
    from jsonb_array_elements(e.items) i
  ) x
  group by 1
  order by 1 desc
  limit 400;
end;
$$;

grant execute on function profit_by_period(date, date, text) to authenticated;
