-- Ejecutar después de 001-023. Idempotente.
--
-- Fiado (venta a crédito), cartera y medios de pago configurables.
--
--  - organizations: medios de pago activos (Nequi, Daviplata, Llave, Tarjeta,
--    Otro y Fiado; el efectivo siempre está activo), nombre del medio "Otro"
--    y plazo por defecto del fiado (días).
--  - clientes: cupo de fiado (credit_limit, null = sin cupo) y plazo propio.
--  - sales: pago con tarjeta, "otro" y fiado; saldo pendiente del fiado
--    (credit_balance) y fecha de vencimiento.
--  - customer_payments + customer_payment_allocations: abonos de los clientes.
--    Cada abono es de UN medio de pago y se reparte entre sus ventas fiadas
--    (la más antigua primero, o una venta puntual).
--  - Caja: los abonos entran en el día en que se reciben (no en el de la
--    venta). Lo vendido fiado no entra a la caja.
--  - Devolución de una venta fiada: se cancela lo que se debía y solo se
--    devuelve el dinero ya pagado (lo cobrado al vender + los abonos, cada uno
--    por su medio de pago). Una venta con abonos no se puede ANULAR (hay que
--    anular primero los abonos o registrarla como devolución).
--  - Reglas del fiado: el administrador puede fiar siempre. El auxiliar solo
--    a clientes ya registrados, con cupo asignado y sin pasarse del cupo.

-- ==========================================================================
-- 0) Formato de pesos para los mensajes de error ($1.234.567)
-- ==========================================================================
create or replace function fmt_cop(p numeric)
returns text
language sql
immutable
as $$ select '$' || replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,990'), ',', '.') $$;

-- ==========================================================================
-- 1) Configuración y columnas nuevas
-- ==========================================================================
alter table organizations
  add column if not exists payment_methods text[] not null default '{nequi,daviplata,llave}',
  add column if not exists payment_other_label text not null default 'Otro',
  add column if not exists default_credit_days int not null default 30;

alter table organizations drop constraint if exists organizations_payment_methods_check;
alter table organizations add constraint organizations_payment_methods_check check (
  payment_methods <@ array['nequi', 'daviplata', 'llave', 'tarjeta', 'otro', 'credito']::text[]
  and default_credit_days between 0 and 365
  and char_length(payment_other_label) between 1 and 30
);

alter table clientes
  add column if not exists credit_limit numeric(12, 2),
  add column if not exists credit_days int;

alter table clientes drop constraint if exists clientes_credit_check;
alter table clientes add constraint clientes_credit_check check (
  (credit_limit is null or credit_limit >= 0)
  and (credit_days is null or credit_days between 0 and 365)
);

alter table sales
  add column if not exists pay_tarjeta numeric(12, 2) not null default 0,
  add column if not exists pay_otro numeric(12, 2) not null default 0,
  add column if not exists pay_otro_label text,
  add column if not exists pay_credito numeric(12, 2) not null default 0,
  add column if not exists credit_balance numeric(12, 2) not null default 0,
  add column if not exists credit_due_date date;

alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check check (
  payment_method in ('efectivo', 'transferencia', 'tarjeta', 'otro', 'credito', 'mixto')
);

alter table sales drop constraint if exists sales_credit_check;
alter table sales add constraint sales_credit_check check (
  credit_balance >= 0 and credit_balance <= pay_credito
);

create index if not exists sales_customer_credit_idx
  on sales (organization_id, customer_id, created_at)
  where credit_balance > 0;

alter table cash_days
  add column if not exists sales_tarjeta numeric(12, 2) not null default 0,
  add column if not exists sales_otro numeric(12, 2) not null default 0,
  add column if not exists sales_credito numeric(12, 2) not null default 0,
  add column if not exists returns_tarjeta numeric(12, 2) not null default 0,
  add column if not exists returns_otro numeric(12, 2) not null default 0,
  add column if not exists returns_credito numeric(12, 2) not null default 0,
  add column if not exists abonos_cash numeric(12, 2) not null default 0,
  add column if not exists abonos_nequi numeric(12, 2) not null default 0,
  add column if not exists abonos_daviplata numeric(12, 2) not null default 0,
  add column if not exists abonos_llave numeric(12, 2) not null default 0,
  add column if not exists abonos_tarjeta numeric(12, 2) not null default 0,
  add column if not exists abonos_otro numeric(12, 2) not null default 0;

-- ==========================================================================
-- 2) Abonos
-- ==========================================================================
create table if not exists customer_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid references clientes (id) on delete set null,
  customer_name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'nequi', 'daviplata', 'llave', 'tarjeta', 'otro')),
  method_label text,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references profiles (id) on delete set null,
  void_reason text
);

create index if not exists customer_payments_org_created_idx
  on customer_payments (organization_id, created_at desc);
create index if not exists customer_payments_customer_idx
  on customer_payments (customer_id, created_at desc);

create table if not exists customer_payment_allocations (
  payment_id uuid not null references customer_payments (id) on delete cascade,
  sale_id uuid not null references sales (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  primary key (payment_id, sale_id)
);

create index if not exists customer_payment_allocations_sale_idx
  on customer_payment_allocations (sale_id);

-- Solo lectura para los usuarios: toda escritura pasa por las funciones.
alter table customer_payments enable row level security;
alter table customer_payment_allocations enable row level security;

drop policy if exists customer_payments_select on customer_payments;
create policy customer_payments_select on customer_payments for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists customer_payment_allocations_select on customer_payment_allocations;
create policy customer_payment_allocations_select on customer_payment_allocations for select
  using (organization_id = current_profile_org() or is_super_admin());

-- Un cliente con saldo pendiente no se puede eliminar.
create or replace function clientes_prevent_delete_with_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from sales
     where customer_id = old.id and voided_at is null and credit_balance > 0
  ) then
    raise exception 'Este cliente tiene saldo pendiente de fiado; no se puede eliminar hasta que pague';
  end if;
  return old;
end;
$$;

drop trigger if exists clientes_prevent_delete_with_debt_trg on clientes;
create trigger clientes_prevent_delete_with_debt_trg
  before delete on clientes
  for each row execute function clientes_prevent_delete_with_debt();

-- ==========================================================================
-- 3) Efectos de ventas y devoluciones (ahora con tarjeta, otro y fiado)
--    sign = 1 : venta en su día. pay_credito = lo que se fió.
--    sign = -1: devolución en su día. Se devuelve lo pagado al vender más los
--               abonos (cada uno por su medio); pay_credito = deuda cancelada.
-- ==========================================================================
drop function if exists sales_effects(uuid, timestamptz, timestamptz);

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
  tax_total numeric,
  items jsonb,
  pay_cash numeric,
  pay_nequi numeric,
  pay_daviplata numeric,
  pay_llave numeric,
  pay_tarjeta numeric,
  pay_otro numeric,
  pay_credito numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.created_at, 1, s.total::numeric, s.tax_total::numeric, s.items,
         s.pay_cash::numeric, s.pay_nequi::numeric, s.pay_daviplata::numeric, s.pay_llave::numeric,
         s.pay_tarjeta::numeric, s.pay_otro::numeric, s.pay_credito::numeric
    from sales s
   where s.organization_id = p_org
     and (s.voided_at is null or s.void_kind = 'devolucion')
     and (p_start is null or s.created_at >= p_start)
     and (p_end is null or s.created_at < p_end)
  union all
  select s.id, s.voided_at, -1, s.total::numeric, s.tax_total::numeric, s.items,
         s.pay_cash + coalesce(ab.cash, 0),
         s.pay_nequi + coalesce(ab.nequi, 0),
         s.pay_daviplata + coalesce(ab.dav, 0),
         s.pay_llave + coalesce(ab.llave, 0),
         s.pay_tarjeta + coalesce(ab.tarjeta, 0),
         s.pay_otro + coalesce(ab.otro, 0),
         s.pay_credito - coalesce(ab.total, 0)
    from sales s
    left join lateral (
      select sum(a.amount) filter (where p.method = 'efectivo') as cash,
             sum(a.amount) filter (where p.method = 'nequi') as nequi,
             sum(a.amount) filter (where p.method = 'daviplata') as dav,
             sum(a.amount) filter (where p.method = 'llave') as llave,
             sum(a.amount) filter (where p.method = 'tarjeta') as tarjeta,
             sum(a.amount) filter (where p.method = 'otro') as otro,
             sum(a.amount) as total
        from customer_payment_allocations a
        join customer_payments p on p.id = a.payment_id
       where a.sale_id = s.id and p.voided_at is null
    ) ab on true
   where s.organization_id = p_org
     and s.void_kind = 'devolucion'
     and s.voided_at is not null
     and (p_start is null or s.voided_at >= p_start)
     and (p_end is null or s.voided_at < p_end)
$$;

revoke all on function sales_effects(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- ==========================================================================
-- 4) Cierre de caja: tarjeta, otro, fiado y abonos
-- ==========================================================================
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
  returns_llave numeric,
  sales_tarjeta numeric,
  sales_otro numeric,
  sales_credito numeric,
  returns_tarjeta numeric,
  returns_otro numeric,
  returns_credito numeric,
  abonos_count int,
  abonos_total numeric,
  abonos_cash numeric,
  abonos_nequi numeric,
  abonos_daviplata numeric,
  abonos_llave numeric,
  abonos_tarjeta numeric,
  abonos_otro numeric
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
  with e as (select * from sales_effects(v_org, v_start, v_end)),
  ab as (
    select * from customer_payments cp
     where cp.organization_id = v_org and cp.voided_at is null
       and cp.created_at >= v_start and cp.created_at < v_end
  )
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
    (select coalesce(sum(e.pay_llave), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_tarjeta), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_otro), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_credito), 0) from e where e.sign = 1),
    (select coalesce(sum(e.pay_tarjeta), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_otro), 0) from e where e.sign = -1),
    (select coalesce(sum(e.pay_credito), 0) from e where e.sign = -1),
    (select count(*)::int from ab),
    (select coalesce(sum(ab.amount), 0) from ab),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'efectivo'),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'nequi'),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'daviplata'),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'llave'),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'tarjeta'),
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'otro');
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
  v_sm record;
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

  select * into v_sm from cash_day_summary(p_day);

  -- Las ventas/gastos manuales se asumen en efectivo. Las devoluciones en
  -- efectivo salen de la caja; los abonos en efectivo entran. Lo fiado no
  -- entra a la caja.
  v_expected := v_base + v_sm.sales_cash - v_sm.returns_cash + v_sm.abonos_cash
                + v_sm.manual_sales - v_sm.expenses;

  select full_name into v_name from profiles where id = auth.uid();

  insert into cash_days (
    organization_id, day, base_amount, closed_at, closed_by, closed_by_name,
    sales_cash, sales_nequi, sales_daviplata, sales_llave,
    sales_tarjeta, sales_otro, sales_credito,
    returns_cash, returns_nequi, returns_daviplata, returns_llave,
    returns_tarjeta, returns_otro, returns_credito,
    abonos_cash, abonos_nequi, abonos_daviplata, abonos_llave, abonos_tarjeta, abonos_otro,
    manual_sales, expenses, expected_cash, counted_cash, difference, notes
  )
  values (
    v_org, p_day, v_base, now(), auth.uid(), v_name,
    v_sm.sales_cash, v_sm.sales_nequi, v_sm.sales_daviplata, v_sm.sales_llave,
    v_sm.sales_tarjeta, v_sm.sales_otro, v_sm.sales_credito,
    v_sm.returns_cash, v_sm.returns_nequi, v_sm.returns_daviplata, v_sm.returns_llave,
    v_sm.returns_tarjeta, v_sm.returns_otro, v_sm.returns_credito,
    v_sm.abonos_cash, v_sm.abonos_nequi, v_sm.abonos_daviplata, v_sm.abonos_llave,
    v_sm.abonos_tarjeta, v_sm.abonos_otro,
    v_sm.manual_sales, v_sm.expenses, v_expected, p_counted, p_counted - v_expected,
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
    sales_tarjeta = excluded.sales_tarjeta,
    sales_otro = excluded.sales_otro,
    sales_credito = excluded.sales_credito,
    returns_cash = excluded.returns_cash,
    returns_nequi = excluded.returns_nequi,
    returns_daviplata = excluded.returns_daviplata,
    returns_llave = excluded.returns_llave,
    returns_tarjeta = excluded.returns_tarjeta,
    returns_otro = excluded.returns_otro,
    returns_credito = excluded.returns_credito,
    abonos_cash = excluded.abonos_cash,
    abonos_nequi = excluded.abonos_nequi,
    abonos_daviplata = excluded.abonos_daviplata,
    abonos_llave = excluded.abonos_llave,
    abonos_tarjeta = excluded.abonos_tarjeta,
    abonos_otro = excluded.abonos_otro,
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
         sales_tarjeta = 0, sales_otro = 0, sales_credito = 0,
         returns_cash = 0, returns_nequi = 0, returns_daviplata = 0, returns_llave = 0,
         returns_tarjeta = 0, returns_otro = 0, returns_credito = 0,
         abonos_cash = 0, abonos_nequi = 0, abonos_daviplata = 0, abonos_llave = 0,
         abonos_tarjeta = 0, abonos_otro = 0,
         manual_sales = 0, expenses = 0, expected_cash = 0,
         counted_cash = null, difference = null, notes = null
   where organization_id = v_org and day = p_day;
end;
$$;

grant execute on function reopen_cash_day(date) to authenticated;

-- ==========================================================================
-- 5) create_sale(): tarjeta, otro, fiado y medios de pago activos.
--    Misma firma que en la 023.
-- ==========================================================================
create or replace function create_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_customer_data jsonb default null,
  p_payment jsonb default null,
  p_customer_email text default null
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
  v_method text := coalesce(p_payment->>'method', 'efectivo');
  v_channel text;
  v_cash numeric(12, 2) := 0;
  v_nequi numeric(12, 2) := 0;
  v_dav numeric(12, 2) := 0;
  v_llave numeric(12, 2) := 0;
  v_tarjeta numeric(12, 2) := 0;
  v_otro numeric(12, 2) := 0;
  v_credit numeric(12, 2) := 0;
  v_debt numeric(12, 2) := 0;
  v_due date;
  v_sold_by text;
  v_email text;
  v_org organizations%rowtype;
  v_rate numeric := 0;
  v_base numeric(12, 2);
  v_tax numeric(12, 2);
  v_tax_total numeric(12, 2) := 0;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  -- No se registran ventas en un día con cierre de caja (la venta se guarda
  -- con la fecha de hoy). Para vender, el administrador reabre la caja de hoy.
  if exists (
    select 1 from cash_days
     where organization_id = p_organization_id
       and day = org_local_date(now())
       and closed_at is not null
  ) then
    raise exception 'La caja de hoy ya está cerrada; el administrador debe reabrirla para registrar ventas';
  end if;

  select * into v_org from organizations where id = p_organization_id;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  if v_method not in ('efectivo', 'transferencia', 'tarjeta', 'otro', 'credito', 'mixto') then
    raise exception 'Método de pago inválido';
  end if;

  if v_customer_id is not null then
    select * into v_customer from clientes
      where id = v_customer_id and organization_id = p_organization_id
      for update;
    if not found then
      raise exception 'Cliente no encontrado';
    end if;
  elsif p_customer_data is not null and coalesce(trim(p_customer_data->>'nombre'), '') <> '' then
    insert into clientes (organization_id, nombre, tipo_documento, documento, telefono, email, direccion)
    values (
      p_organization_id,
      trim(p_customer_data->>'nombre'),
      nullif(trim(p_customer_data->>'tipo_documento'), ''),
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
      'tipo_documento', v_customer.tipo_documento,
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

    -- Impuesto: solo si el negocio lo activó. Si sus precios incluyen el
    -- impuesto, se separa de adentro (base = precio / (1 + tarifa)); si no,
    -- se suma encima de la base.
    v_rate := case when v_org.tax_enabled then coalesce(v_product.tax_rate, 0) else 0 end;
    if v_rate > 0 and v_org.prices_include_tax then
      v_line_total := round(v_product.sale_price * v_qty, 2);
      v_tax := round(v_line_total * v_rate / (100 + v_rate), 2);
      v_base := v_line_total - v_tax;
    elsif v_rate > 0 then
      v_base := round(v_product.sale_price * v_qty, 2);
      v_tax := round(v_base * v_rate / 100, 2);
      v_line_total := v_base + v_tax;
    else
      v_line_total := round(v_product.sale_price * v_qty, 2);
      v_base := v_line_total;
      v_tax := 0;
    end if;
    v_total := v_total + v_line_total;
    v_tax_total := v_tax_total + v_tax;

    v_items_out := v_items_out || jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'unitPrice', v_product.sale_price,
      'quantity', v_qty,
      'subtotal', v_line_total,
      'taxKind', case when v_rate > 0 then v_product.tax_kind else null end,
      'taxRate', v_rate,
      'base', v_base,
      'tax', v_tax
    );
  end loop;

  -- Pago: el total lo calcula el servidor; el cliente solo indica el método
  -- (y, en pago mixto, cómo se reparte).
  if v_method = 'efectivo' then
    v_cash := v_total;
  elsif v_method = 'transferencia' then
    v_channel := p_payment->>'channel';
    if v_channel = 'nequi' then v_nequi := v_total;
    elsif v_channel = 'daviplata' then v_dav := v_total;
    elsif v_channel = 'llave' then v_llave := v_total;
    else raise exception 'Indica si la transferencia fue por Nequi, Daviplata o Llave';
    end if;
  elsif v_method = 'tarjeta' then
    v_tarjeta := v_total;
  elsif v_method = 'otro' then
    v_otro := v_total;
  elsif v_method = 'credito' then
    v_credit := v_total;
  else
    v_cash := round(coalesce((p_payment->>'efectivo')::numeric, 0), 2);
    v_nequi := round(coalesce((p_payment->>'nequi')::numeric, 0), 2);
    v_dav := round(coalesce((p_payment->>'daviplata')::numeric, 0), 2);
    v_llave := round(coalesce((p_payment->>'llave')::numeric, 0), 2);
    v_tarjeta := round(coalesce((p_payment->>'tarjeta')::numeric, 0), 2);
    v_otro := round(coalesce((p_payment->>'otro')::numeric, 0), 2);
    v_credit := round(coalesce((p_payment->>'credito')::numeric, 0), 2);
    if least(v_cash, v_nequi, v_dav, v_llave, v_tarjeta, v_otro, v_credit) < 0 then
      raise exception 'Los montos del pago no pueden ser negativos';
    end if;
    if abs((v_cash + v_nequi + v_dav + v_llave + v_tarjeta + v_otro + v_credit) - v_total) > 0.009 then
      raise exception 'Los montos del pago mixto deben sumar el total de la venta (%)', fmt_cop(v_total);
    end if;
  end if;

  -- Solo los medios de pago que el negocio tiene activos (el efectivo siempre).
  if v_nequi > 0 and not ('nequi' = any(v_org.payment_methods)) then
    raise exception 'Nequi no está activo como medio de pago';
  end if;
  if v_dav > 0 and not ('daviplata' = any(v_org.payment_methods)) then
    raise exception 'Daviplata no está activo como medio de pago';
  end if;
  if v_llave > 0 and not ('llave' = any(v_org.payment_methods)) then
    raise exception 'Llave no está activo como medio de pago';
  end if;
  if v_tarjeta > 0 and not ('tarjeta' = any(v_org.payment_methods)) then
    raise exception 'La tarjeta no está activa como medio de pago';
  end if;
  if v_otro > 0 and not ('otro' = any(v_org.payment_methods)) then
    raise exception '% no está activo como medio de pago', v_org.payment_other_label;
  end if;
  if v_credit > 0 and not ('credito' = any(v_org.payment_methods)) then
    raise exception 'El fiado no está activo en este negocio';
  end if;

  -- Fiado: necesita un cliente. El administrador puede fiar siempre; el
  -- auxiliar solo a clientes ya registrados, con cupo y sin pasarse de él.
  if v_credit > 0 then
    if v_customer_id is null then
      raise exception 'Para fiar debes seleccionar o crear el cliente';
    end if;
    if current_profile_role() <> 'owner' then
      if p_customer_id is null then
        raise exception 'Solo el administrador puede fiarle a un cliente nuevo';
      end if;
      if v_customer.credit_limit is null then
        raise exception 'Este cliente no tiene cupo de fiado; el administrador puede asignarlo en Clientes';
      end if;
      select coalesce(sum(s.credit_balance), 0) into v_debt
        from sales s
       where s.organization_id = p_organization_id
         and s.customer_id = v_customer_id
         and s.voided_at is null
         and s.credit_balance > 0;
      if v_debt + v_credit > v_customer.credit_limit then
        raise exception 'El fiado supera el cupo del cliente (cupo %, debe %, disponible %)',
          fmt_cop(v_customer.credit_limit), fmt_cop(v_debt),
          fmt_cop(greatest(v_customer.credit_limit - v_debt, 0));
      end if;
    end if;
    v_due := org_local_date(now()) + coalesce(v_customer.credit_days, v_org.default_credit_days, 30);
  end if;

  select full_name into v_sold_by from profiles where id = auth.uid();
  v_email := coalesce(nullif(trim(coalesce(p_customer_email, '')), ''), v_customer.email);

  update organizations set next_sale_number = next_sale_number + 1
    where id = p_organization_id
    returning next_sale_number - 1 into v_sale_number;

  insert into sales (
    organization_id, items, total, created_by, customer_id, customer_snapshot,
    sale_number, payment_method, pay_cash, pay_nequi, pay_daviplata, pay_llave,
    pay_tarjeta, pay_otro, pay_otro_label, pay_credito, credit_balance, credit_due_date,
    sold_by_name, customer_email, tax_total
  )
  values (
    p_organization_id, v_items_out, v_total, auth.uid(), v_customer_id, v_customer_snapshot,
    v_sale_number, v_method, v_cash, v_nequi, v_dav, v_llave,
    v_tarjeta, v_otro, case when v_otro > 0 then v_org.payment_other_label end,
    v_credit, v_credit, v_due,
    v_sold_by, v_email, v_tax_total
  )
  returning id into v_sale_id;

  return query select v_sale_id, v_total, v_sale_number;
end;
$$;

grant execute on function create_sale(uuid, jsonb, uuid, jsonb, jsonb, text) to authenticated;

-- ==========================================================================
-- 6) void_sale(): una venta con abonos no se anula (solo se devuelve). La
--    devolución cancela lo que se debía.
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
    if exists (
      select 1 from customer_payment_allocations a
        join customer_payments p on p.id = a.payment_id
       where a.sale_id = p_sale_id and p.voided_at is null
    ) then
      raise exception 'Esta venta fiada ya tiene abonos: anula primero los abonos o regístrala como devolución';
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
        void_reason = nullif(trim(coalesce(p_reason, '')), ''),
        credit_balance = 0
    where id = p_sale_id;
end;
$$;

grant execute on function void_sale(uuid, text, text) to authenticated;

-- ==========================================================================
-- 7) Abonos: registrar y anular
-- ==========================================================================
create or replace function register_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method text,
  p_sale_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := current_profile_org();
  v_org organizations%rowtype;
  v_customer clientes%rowtype;
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_debt numeric(12, 2);
  v_left numeric(12, 2);
  v_apply numeric(12, 2);
  v_sale record;
  v_payment_id uuid;
  v_name text;
begin
  if v_org_id is null then
    raise exception 'No autorizado';
  end if;
  select * into v_org from organizations where id = v_org_id;

  select * into v_customer from clientes
   where id = p_customer_id and organization_id = v_org_id
   for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if v_amount <= 0 then
    raise exception 'El abono debe ser mayor a cero';
  end if;

  if p_method not in ('efectivo', 'nequi', 'daviplata', 'llave', 'tarjeta', 'otro') then
    raise exception 'Medio de pago inválido';
  end if;
  if p_method <> 'efectivo' and not (p_method = any(v_org.payment_methods)) then
    raise exception 'Ese medio de pago no está activo';
  end if;

  if exists (
    select 1 from cash_days
     where organization_id = v_org_id
       and day = org_local_date(now())
       and closed_at is not null
  ) then
    raise exception 'La caja de hoy ya está cerrada; el administrador debe reabrirla para recibir abonos';
  end if;

  select coalesce(sum(s.credit_balance), 0) into v_debt
    from sales s
   where s.organization_id = v_org_id
     and s.customer_id = p_customer_id
     and s.voided_at is null
     and s.credit_balance > 0
     and (p_sale_id is null or s.id = p_sale_id);

  if v_debt <= 0 then
    raise exception '%', case when p_sale_id is null
      then 'Este cliente no tiene saldo pendiente'
      else 'Esa venta no tiene saldo pendiente' end;
  end if;
  if v_amount > v_debt then
    raise exception 'El abono (%) supera lo que se debe (%)', fmt_cop(v_amount), fmt_cop(v_debt);
  end if;

  select full_name into v_name from profiles where id = auth.uid();

  insert into customer_payments (
    organization_id, customer_id, customer_name, amount, method, method_label,
    notes, created_by, created_by_name
  )
  values (
    v_org_id, p_customer_id, v_customer.nombre, v_amount, p_method,
    case when p_method = 'otro' then v_org.payment_other_label end,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), v_name
  )
  returning id into v_payment_id;

  -- Se reparte entre las ventas fiadas, la más antigua primero.
  v_left := v_amount;
  for v_sale in
    select s.id, s.credit_balance from sales s
     where s.organization_id = v_org_id
       and s.customer_id = p_customer_id
       and s.voided_at is null
       and s.credit_balance > 0
       and (p_sale_id is null or s.id = p_sale_id)
     order by s.created_at, s.id
     for update
  loop
    exit when v_left <= 0;
    v_apply := least(v_left, v_sale.credit_balance);
    insert into customer_payment_allocations (payment_id, sale_id, organization_id, amount)
    values (v_payment_id, v_sale.id, v_org_id, v_apply);
    update sales set credit_balance = credit_balance - v_apply where id = v_sale.id;
    v_left := v_left - v_apply;
  end loop;

  return v_payment_id;
end;
$$;

grant execute on function register_customer_payment(uuid, numeric, text, uuid, text) to authenticated;

create or replace function void_customer_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment customer_payments%rowtype;
  v_alloc record;
begin
  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede anular un abono';
  end if;

  select * into v_payment from customer_payments where id = p_payment_id for update;
  if not found or v_payment.organization_id is distinct from current_profile_org() then
    raise exception 'Abono no encontrado';
  end if;
  if v_payment.voided_at is not null then
    raise exception 'Este abono ya fue anulado';
  end if;

  if exists (
    select 1 from cash_days
     where organization_id = v_payment.organization_id
       and day = org_local_date(v_payment.created_at)
       and closed_at is not null
  ) then
    raise exception 'La caja del día de este abono ya está cerrada; reábrela para poder anularlo';
  end if;

  if exists (
    select 1 from customer_payment_allocations a
      join sales s on s.id = a.sale_id
     where a.payment_id = p_payment_id and s.voided_at is not null
  ) then
    raise exception 'Una venta de este abono ya fue devuelta; el abono no se puede anular';
  end if;

  for v_alloc in
    select a.sale_id, a.amount from customer_payment_allocations a
     where a.payment_id = p_payment_id
  loop
    update sales set credit_balance = credit_balance + v_alloc.amount where id = v_alloc.sale_id;
  end loop;

  update customer_payments
     set voided_at = now(),
         voided_by = auth.uid(),
         void_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_payment_id;
end;
$$;

grant execute on function void_customer_payment(uuid, text) to authenticated;

-- ==========================================================================
-- 8) Cartera: lo que debe cada cliente y qué tan vencido está.
--    Respeta RLS (security invoker): cada usuario ve solo su negocio.
-- ==========================================================================
create or replace function cartera_resumen()
returns table (
  customer_id uuid,
  nombre text,
  documento text,
  telefono text,
  credit_limit numeric,
  sales_count int,
  debt numeric,
  current_amount numeric,
  overdue_1_30 numeric,
  overdue_31_60 numeric,
  overdue_61_90 numeric,
  overdue_90 numeric,
  oldest_due date
)
language sql
stable
set search_path = public
as $$
  with s as (
    select s.customer_id, s.credit_balance,
           org_local_date(now()) - s.credit_due_date as late
      from sales s
     where s.organization_id = current_profile_org()
       and s.voided_at is null
       and s.credit_balance > 0
       and s.customer_id is not null
  )
  select c.id, c.nombre, c.documento, c.telefono, c.credit_limit,
         count(*)::int,
         sum(s.credit_balance),
         coalesce(sum(s.credit_balance) filter (where s.late is null or s.late <= 0), 0),
         coalesce(sum(s.credit_balance) filter (where s.late between 1 and 30), 0),
         coalesce(sum(s.credit_balance) filter (where s.late between 31 and 60), 0),
         coalesce(sum(s.credit_balance) filter (where s.late between 61 and 90), 0),
         coalesce(sum(s.credit_balance) filter (where s.late > 90), 0),
         min(org_local_date(now()) - s.late)
    from s
    join clientes c on c.id = s.customer_id
   group by c.id, c.nombre, c.documento, c.telefono, c.credit_limit
   order by max(s.late) desc nulls last, sum(s.credit_balance) desc
$$;

grant execute on function cartera_resumen() to authenticated;
