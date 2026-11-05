-- Ejecutar después de 001-013. Idempotente.
--
-- 1) Ventas por productos: método de pago, "vendido por" (copia del nombre),
--    correo del cliente y estado de envío (base para enviar facturas por
--    correo y, más adelante, facturación electrónica).
-- 2) Conceptos configurables para ventas manuales y gastos (movement_concepts)
--    + columna `concept` en movements.
-- 3) Cierre de caja por día (cash_days) y sus funciones.
-- 4) create_sale() recibe pago y correo; void_sale() no deja anular ventas de
--    un día ya cerrado.
--
-- Zona horaria de "día": America/Bogota.

-- ==========================================================================
-- 0) Helper: fecha local (Colombia) de un timestamp
-- ==========================================================================
create or replace function org_local_date(ts timestamptz)
returns date
language sql
immutable
as $$ select (ts at time zone 'America/Bogota')::date $$;

-- ==========================================================================
-- 1) sales: pago, vendedor, correo
-- ==========================================================================
alter table sales
  add column if not exists payment_method text not null default 'efectivo',
  add column if not exists pay_cash numeric(12, 2) not null default 0,
  add column if not exists pay_nequi numeric(12, 2) not null default 0,
  add column if not exists pay_daviplata numeric(12, 2) not null default 0,
  add column if not exists pay_llave numeric(12, 2) not null default 0,
  add column if not exists sold_by_name text,
  add column if not exists customer_email text,
  add column if not exists email_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_payment_method_check'
  ) then
    alter table sales
      add constraint sales_payment_method_check
      check (payment_method in ('efectivo', 'transferencia', 'mixto'));
  end if;
end $$;

-- Ventas anteriores a esta migración: se asumen en efectivo.
update sales
   set pay_cash = total
 where pay_cash + pay_nequi + pay_daviplata + pay_llave = 0;

update sales s
   set sold_by_name = p.full_name
  from profiles p
 where p.id = s.created_by and s.sold_by_name is null;

update sales
   set customer_email = customer_snapshot->>'email'
 where customer_email is null and customer_snapshot ? 'email'
   and nullif(customer_snapshot->>'email', '') is not null;

create index if not exists sales_org_created_idx on sales (organization_id, created_at desc);

-- ==========================================================================
-- 2) Conceptos de movimientos (configurables por organización)
-- ==========================================================================
create table if not exists movement_concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  type text not null check (type in ('venta', 'gasto')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, type, name)
);

create index if not exists movement_concepts_org_idx on movement_concepts (organization_id);

alter table movement_concepts enable row level security;

drop policy if exists movement_concepts_select on movement_concepts;
create policy movement_concepts_select on movement_concepts for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists movement_concepts_insert on movement_concepts;
create policy movement_concepts_insert on movement_concepts for insert
  with check (
    organization_id = current_profile_org() and current_profile_role() = 'owner'
  );

drop policy if exists movement_concepts_delete on movement_concepts;
create policy movement_concepts_delete on movement_concepts for delete
  using (
    organization_id = current_profile_org() and current_profile_role() = 'owner'
  );

alter table movements add column if not exists concept text;

-- Conceptos iniciales para cada organización (existentes y nuevas).
create or replace function seed_default_concepts(p_organization_id uuid)
returns void
language sql
as $$
  insert into movement_concepts (organization_id, type, name)
  values
    (p_organization_id, 'venta', 'Venta manual'),
    (p_organization_id, 'gasto', 'Mantenimiento'),
    (p_organization_id, 'gasto', 'Mano de obra'),
    (p_organization_id, 'gasto', 'Servicios públicos'),
    (p_organization_id, 'gasto', 'Arriendo'),
    (p_organization_id, 'gasto', 'Compra de mercancía'),
    (p_organization_id, 'gasto', 'Otro')
  on conflict do nothing;
$$;

select seed_default_concepts(id) from organizations;

create or replace function organizations_seed_concepts()
returns trigger
language plpgsql
as $$
begin
  perform seed_default_concepts(new.id);
  return new;
end;
$$;

drop trigger if exists organizations_seed_concepts_trg on organizations;
create trigger organizations_seed_concepts_trg
  after insert on organizations
  for each row execute function organizations_seed_concepts();

-- ==========================================================================
-- 3) Cierre de caja por día
-- ==========================================================================
create table if not exists cash_days (
  organization_id uuid not null references organizations (id) on delete cascade,
  day date not null,
  base_amount numeric(12, 2) not null default 0,
  closed_at timestamptz,
  closed_by uuid references profiles (id) on delete set null,
  closed_by_name text,
  sales_cash numeric(12, 2) not null default 0,
  sales_nequi numeric(12, 2) not null default 0,
  sales_daviplata numeric(12, 2) not null default 0,
  sales_llave numeric(12, 2) not null default 0,
  manual_sales numeric(12, 2) not null default 0,
  expenses numeric(12, 2) not null default 0,
  expected_cash numeric(12, 2) not null default 0,
  counted_cash numeric(12, 2),
  difference numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  primary key (organization_id, day)
);

alter table cash_days enable row level security;

-- Solo lectura: toda escritura pasa por las funciones de abajo.
drop policy if exists cash_days_select on cash_days;
create policy cash_days_select on cash_days for select
  using (
    (organization_id = current_profile_org() and current_profile_role() = 'owner')
    or is_super_admin()
  );

create or replace function set_cash_base(p_day date, p_base numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede registrar la base de caja';
  end if;
  if p_base is null or p_base < 0 then
    raise exception 'La base no puede ser negativa';
  end if;
  if exists (
    select 1 from cash_days
     where organization_id = v_org and day = p_day and closed_at is not null
  ) then
    raise exception 'Ese día ya está cerrado';
  end if;

  insert into cash_days (organization_id, day, base_amount)
  values (v_org, p_day, p_base)
  on conflict (organization_id, day) do update set base_amount = excluded.base_amount;
end;
$$;

grant execute on function set_cash_base(date, numeric) to authenticated;

-- Cifras del día (ventas por método sin anuladas + movimientos manuales).
-- La usan la pantalla de cierre y close_cash_day(), para que ambas coincidan.
create or replace function cash_day_summary(p_day date)
returns table (
  sales_count int,
  sales_total numeric,
  sales_cash numeric,
  sales_nequi numeric,
  sales_daviplata numeric,
  sales_llave numeric,
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
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'No autorizado';
  end if;

  return query
  select
    (select count(*)::int from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(total), 0) from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(pay_cash), 0) from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(pay_nequi), 0) from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(pay_daviplata), 0) from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(pay_llave), 0) from sales
      where organization_id = v_org and voided_at is null
        and org_local_date(created_at) = p_day),
    (select coalesce(sum(amount), 0) from movements
      where organization_id = v_org and type = 'venta' and occurred_at = p_day),
    (select coalesce(sum(amount), 0) from movements
      where organization_id = v_org and type = 'gasto' and occurred_at = p_day);
end;
$$;

grant execute on function cash_day_summary(date) to authenticated;

-- Ventas registradas por el sistema, agrupadas por día (para el listado de
-- "Ventas y Gastos"). Respeta RLS (security invoker).
create or replace function daily_sales()
returns table (day date, sales_count int, total numeric)
language sql
stable
as $$
  select org_local_date(created_at) as day,
         count(*)::int as sales_count,
         coalesce(sum(total), 0) as total
    from sales
   where organization_id = current_profile_org()
     and voided_at is null
   group by 1
   order by 1 desc;
$$;

grant execute on function daily_sales() to authenticated;

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
         sm.manual_sales, sm.expenses
    into v_cash, v_nequi, v_dav, v_llave, v_manual, v_expenses
    from cash_day_summary(p_day) sm;

  -- Las ventas/gastos manuales no registran método de pago: se asumen en
  -- efectivo para el cuadre de caja.
  v_expected := v_base + v_cash + v_manual - v_expenses;

  select full_name into v_name from profiles where id = auth.uid();

  insert into cash_days (
    organization_id, day, base_amount, closed_at, closed_by, closed_by_name,
    sales_cash, sales_nequi, sales_daviplata, sales_llave,
    manual_sales, expenses, expected_cash, counted_cash, difference, notes
  )
  values (
    v_org, p_day, v_base, now(), auth.uid(), v_name,
    v_cash, v_nequi, v_dav, v_llave,
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
         manual_sales = 0, expenses = 0, expected_cash = 0,
         counted_cash = null, difference = null, notes = null
   where organization_id = v_org and day = p_day;
end;
$$;

grant execute on function reopen_cash_day(date) to authenticated;

-- ==========================================================================
-- 4) create_sale(): agrega pago y correo. Cambia de firma (4 -> 6 args), así
--    que se elimina la anterior para no dejar sobrecargas ambiguas.
-- ==========================================================================
drop function if exists create_sale(uuid, jsonb, uuid, jsonb);

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
  v_sold_by text;
  v_email text;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  if v_method not in ('efectivo', 'transferencia', 'mixto') then
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
  else
    v_cash := coalesce((p_payment->>'efectivo')::numeric, 0);
    v_nequi := coalesce((p_payment->>'nequi')::numeric, 0);
    v_dav := coalesce((p_payment->>'daviplata')::numeric, 0);
    v_llave := coalesce((p_payment->>'llave')::numeric, 0);
    if least(v_cash, v_nequi, v_dav, v_llave) < 0 then
      raise exception 'Los montos del pago no pueden ser negativos';
    end if;
    if abs((v_cash + v_nequi + v_dav + v_llave) - v_total) > 0.009 then
      raise exception 'Los montos del pago mixto deben sumar el total de la venta (%)', v_total;
    end if;
  end if;

  select full_name into v_sold_by from profiles where id = auth.uid();
  v_email := coalesce(nullif(trim(coalesce(p_customer_email, '')), ''), v_customer.email);

  update organizations set next_sale_number = next_sale_number + 1
    where id = p_organization_id
    returning next_sale_number - 1 into v_sale_number;

  insert into sales (
    organization_id, items, total, created_by, customer_id, customer_snapshot,
    sale_number, payment_method, pay_cash, pay_nequi, pay_daviplata, pay_llave,
    sold_by_name, customer_email
  )
  values (
    p_organization_id, v_items_out, v_total, auth.uid(), v_customer_id, v_customer_snapshot,
    v_sale_number, v_method, v_cash, v_nequi, v_dav, v_llave,
    v_sold_by, v_email
  )
  returning id into v_sale_id;

  return query select v_sale_id, v_total, v_sale_number;
end;
$$;

grant execute on function create_sale(uuid, jsonb, uuid, jsonb, jsonb, text) to authenticated;

-- ==========================================================================
-- 5) void_sale(): no permite anular ventas de un día con cierre de caja
-- ==========================================================================
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

  if exists (
    select 1 from cash_days
     where organization_id = v_sale.organization_id
       and day = org_local_date(v_sale.created_at)
       and closed_at is not null
  ) then
    raise exception 'El día de esta venta ya tiene cierre de caja; reábrelo para poder anularla';
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
