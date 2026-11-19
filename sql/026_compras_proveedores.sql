-- Ejecutar después de 001-025. Idempotente.
--
-- Compras y proveedores (módulo "compras"). Todo es solo del administrador
-- (muestra costos).
--
--  - suppliers: proveedores del negocio.
--  - purchases: compras (entrada de mercancía). Cada compra:
--      * suma al stock de cada producto (stock_movements source 'purchase');
--      * actualiza el precio de compra con COSTO PROMEDIO PONDERADO:
--          nuevo = (stock_actual * costo_actual + cantidad * costo_compra)
--                  / (stock_actual + cantidad)
--        (si no había stock, queda el costo de la compra);
--      * opcionalmente cambia el precio de venta.
--    Se paga de contado (desde la caja, o por fuera: banco/transferencia) o a
--    crédito (cuenta por pagar con fecha de vencimiento).
--  - supplier_payments: abonos a compras a crédito (desde la caja o por fuera).
--  - Caja: lo pagado DESDE LA CAJA (compras de contado y abonos) sale del
--    efectivo del día en que se registra. Lo pagado por fuera no la toca.
--  - Utilidad: las compras NO son gastos; su costo entra cuando se vende el
--    producto (costo congelado en cada venta).
--  - Anular una compra: devuelve el stock y revierte el costo promedio. Solo
--    si queda stock suficiente, si no tiene abonos y, si se pagó desde la
--    caja, si la caja de ese día sigue abierta. El precio de venta no se
--    revierte.

-- ==========================================================================
-- 1) Módulo
-- ==========================================================================
insert into modules (key, name, description, price)
values (
  'compras',
  'Compras y Proveedores',
  'Entrada de mercancía con costo promedio, proveedores y cuentas por pagar.',
  0
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description;

-- ==========================================================================
-- 2) Tablas
-- ==========================================================================
alter table organizations
  add column if not exists next_purchase_number int not null default 1;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  nombre text not null,
  nit text,
  telefono text,
  email text,
  direccion text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_org_idx on suppliers (organization_id, nombre);

drop trigger if exists suppliers_set_updated_at on suppliers;
create trigger suppliers_set_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  purchase_number int not null,
  supplier_id uuid references suppliers (id) on delete set null,
  supplier_name text,
  invoice_number text,
  purchase_date date not null,
  items jsonb not null,
  total numeric(12, 2) not null check (total >= 0),
  payment_type text not null check (payment_type in ('contado', 'credito')),
  pay_source text check (pay_source in ('caja', 'externo')),
  balance numeric(12, 2) not null default 0,
  due_date date,
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references profiles (id) on delete set null,
  void_reason text,
  check (balance >= 0 and balance <= total),
  check (payment_type = 'credito' or (pay_source is not null and balance = 0))
);

create index if not exists purchases_org_created_idx on purchases (organization_id, created_at desc);
create index if not exists purchases_supplier_idx on purchases (supplier_id);
create index if not exists purchases_payable_idx on purchases (organization_id) where balance > 0;

create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  purchase_id uuid not null references purchases (id) on delete cascade,
  supplier_id uuid references suppliers (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  source text not null check (source in ('caja', 'externo')),
  notes text,
  created_by uuid references profiles (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references profiles (id) on delete set null
);

create index if not exists supplier_payments_org_created_idx
  on supplier_payments (organization_id, created_at desc);
create index if not exists supplier_payments_purchase_idx on supplier_payments (purchase_id);

-- Movimientos de inventario por compras.
alter table stock_movements drop constraint if exists stock_movements_source_check;
alter table stock_movements add constraint stock_movements_source_check
  check (source in ('initial', 'manual', 'sale', 'void', 'import', 'purchase', 'purchase_void'));

-- RLS: proveedores y compras solo los ve y edita el administrador. Las compras
-- y los abonos solo se escriben con las funciones de abajo.
alter table suppliers enable row level security;
alter table purchases enable row level security;
alter table supplier_payments enable row level security;

drop policy if exists suppliers_select on suppliers;
create policy suppliers_select on suppliers for select
  using ((organization_id = current_profile_org() and current_profile_role() = 'owner') or is_super_admin());

drop policy if exists suppliers_insert on suppliers;
create policy suppliers_insert on suppliers for insert
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists suppliers_update on suppliers;
create policy suppliers_update on suppliers for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists suppliers_delete on suppliers;
create policy suppliers_delete on suppliers for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists purchases_select on purchases;
create policy purchases_select on purchases for select
  using ((organization_id = current_profile_org() and current_profile_role() = 'owner') or is_super_admin());

drop policy if exists supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select
  using ((organization_id = current_profile_org() and current_profile_role() = 'owner') or is_super_admin());

-- Un proveedor al que se le debe no se puede eliminar.
create or replace function suppliers_prevent_delete_with_debt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from purchases
     where supplier_id = old.id and voided_at is null and balance > 0
  ) then
    raise exception 'A este proveedor se le debe dinero; no se puede eliminar hasta pagarle';
  end if;
  return old;
end;
$$;

drop trigger if exists suppliers_prevent_delete_with_debt_trg on suppliers;
create trigger suppliers_prevent_delete_with_debt_trg
  before delete on suppliers
  for each row execute function suppliers_prevent_delete_with_debt();

-- ==========================================================================
-- 3) Registrar una compra
--    p_items: [{productId, quantity, unitCost, salePrice?}]
--    p_payment: {"type":"contado","source":"caja"|"externo"}
--            o {"type":"credito","days":30}
-- ==========================================================================
create or replace function create_purchase(
  p_supplier_id uuid,
  p_invoice_number text,
  p_purchase_date date,
  p_items jsonb,
  p_payment jsonb,
  p_notes text default null
)
returns table (purchase_id uuid, purchase_number int, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_profile_org();
  v_supplier suppliers%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
  v_cost numeric(12, 2);
  v_sale numeric(12, 2);
  v_new_cost numeric(12, 2);
  v_line numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_items_out jsonb := '[]'::jsonb;
  v_type text := coalesce(p_payment->>'type', '');
  v_source text;
  v_days int;
  v_due date;
  v_number int;
  v_id uuid;
  v_name text;
  v_seen uuid[] := '{}';
begin
  if v_org is null or current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede registrar compras';
  end if;

  if p_purchase_date is null or p_purchase_date > org_local_date(now()) then
    raise exception 'La fecha de la compra no puede ser futura';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto a la compra';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from suppliers where id = p_supplier_id and organization_id = v_org;
    if not found then
      raise exception 'Proveedor no encontrado';
    end if;
  end if;

  if v_type = 'contado' then
    v_source := p_payment->>'source';
    if v_source not in ('caja', 'externo') then
      raise exception 'Indica si la compra se pagó desde la caja o por fuera';
    end if;
    if v_source = 'caja' and exists (
      select 1 from cash_days
       where organization_id = v_org and day = org_local_date(now()) and closed_at is not null
    ) then
      raise exception 'La caja de hoy ya está cerrada; reábrela para pagar desde la caja';
    end if;
  elsif v_type = 'credito' then
    if p_supplier_id is null then
      raise exception 'Para comprar a crédito elige el proveedor';
    end if;
    v_days := coalesce(nullif(p_payment->>'days', '')::int, 30);
    if v_days < 0 or v_days > 365 then
      raise exception 'El plazo debe estar entre 0 y 365 días';
    end if;
    v_due := p_purchase_date + v_days;
  else
    raise exception 'Forma de pago inválida';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::int;
    v_cost := round(coalesce((v_item->>'unitCost')::numeric, -1), 2);
    v_sale := nullif(v_item->>'salePrice', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad inválida';
    end if;
    if v_cost < 0 then
      raise exception 'Costo inválido';
    end if;
    if v_sale is not null and v_sale < 0 then
      raise exception 'Precio de venta inválido';
    end if;

    select * into v_product from products
     where id = (v_item->>'productId')::uuid and organization_id = v_org
     for update;
    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if v_product.id = any(v_seen) then
      raise exception 'El producto "%" está repetido en la compra', v_product.name;
    end if;
    v_seen := v_seen || v_product.id;

    -- Costo promedio ponderado (si no había stock, el de esta compra).
    if v_product.quantity > 0 then
      v_new_cost := round(
        (v_product.quantity * v_product.purchase_price + v_qty * v_cost) / (v_product.quantity + v_qty), 2
      );
    else
      v_new_cost := v_cost;
    end if;

    update products
       set quantity = quantity + v_qty,
           purchase_price = v_new_cost,
           sale_price = coalesce(round(v_sale, 2), sale_price)
     where id = v_product.id;

    insert into stock_movements
      (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
    values
      (v_org, v_product.id, v_qty, v_product.quantity, v_product.quantity + v_qty,
       'Compra' || coalesce(' a ' || v_supplier.nombre, ''), 'purchase', auth.uid());

    v_line := round(v_qty * v_cost, 2);
    v_total := v_total + v_line;

    v_items_out := v_items_out || jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'quantity', v_qty,
      'unitCost', v_cost,
      'subtotal', v_line,
      'previousCost', v_product.purchase_price,
      'newCost', v_new_cost,
      'previousSalePrice', v_product.sale_price,
      'salePrice', coalesce(round(v_sale, 2), v_product.sale_price)
    );
  end loop;

  select full_name into v_name from profiles where id = auth.uid();

  update organizations set next_purchase_number = next_purchase_number + 1
   where id = v_org
   returning next_purchase_number - 1 into v_number;

  insert into purchases (
    organization_id, purchase_number, supplier_id, supplier_name, invoice_number, purchase_date,
    items, total, payment_type, pay_source, balance, due_date, notes, created_by, created_by_name
  )
  values (
    v_org, v_number, p_supplier_id, v_supplier.nombre, nullif(trim(coalesce(p_invoice_number, '')), ''),
    p_purchase_date, v_items_out, v_total, v_type,
    case when v_type = 'contado' then v_source end,
    case when v_type = 'credito' then v_total else 0 end,
    v_due, nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), v_name
  )
  returning id into v_id;

  return query select v_id, v_number, v_total;
end;
$$;

grant execute on function create_purchase(uuid, text, date, jsonb, jsonb, text) to authenticated;

-- ==========================================================================
-- 4) Anular una compra
-- ==========================================================================
create or replace function void_purchase(p_purchase_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p purchases%rowtype;
  v_item jsonb;
  v_product products%rowtype;
  v_qty int;
  v_cost numeric;
  v_new_cost numeric(12, 2);
begin
  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede anular compras';
  end if;

  select * into v_p from purchases where id = p_purchase_id for update;
  if not found or v_p.organization_id is distinct from current_profile_org() then
    raise exception 'Compra no encontrada';
  end if;
  if v_p.voided_at is not null then
    raise exception 'Esta compra ya fue anulada';
  end if;
  if exists (select 1 from supplier_payments where purchase_id = p_purchase_id and voided_at is null) then
    raise exception 'Esta compra tiene abonos; anula primero los abonos';
  end if;
  if v_p.pay_source = 'caja' and exists (
    select 1 from cash_days
     where organization_id = v_p.organization_id
       and day = org_local_date(v_p.created_at)
       and closed_at is not null
  ) then
    raise exception 'La caja del día de esta compra ya está cerrada; reábrela para anularla';
  end if;

  for v_item in select * from jsonb_array_elements(v_p.items)
  loop
    v_qty := (v_item->>'quantity')::int;
    v_cost := (v_item->>'unitCost')::numeric;

    select * into v_product from products where id = (v_item->>'productId')::uuid for update;
    if not found then
      continue;
    end if;
    if v_product.quantity < v_qty then
      raise exception 'No se puede anular: de "%" quedan % y la compra trajo %', v_product.name, v_product.quantity, v_qty;
    end if;

    -- Revierte el costo promedio. Si el stock queda en 0 vuelve el costo anterior.
    if v_product.quantity - v_qty > 0 then
      v_new_cost := round(
        (v_product.quantity * v_product.purchase_price - v_qty * v_cost) / (v_product.quantity - v_qty), 2
      );
      if v_new_cost < 0 then
        v_new_cost := coalesce((v_item->>'previousCost')::numeric, v_product.purchase_price);
      end if;
    else
      v_new_cost := coalesce((v_item->>'previousCost')::numeric, v_product.purchase_price);
    end if;

    update products
       set quantity = quantity - v_qty,
           purchase_price = v_new_cost
     where id = v_product.id;

    insert into stock_movements
      (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
    values
      (v_p.organization_id, v_product.id, -v_qty, v_product.quantity, v_product.quantity - v_qty,
       'Anulación de compra #' || v_p.purchase_number, 'purchase_void', auth.uid());
  end loop;

  update purchases
     set voided_at = now(), voided_by = auth.uid(), balance = 0,
         void_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_purchase_id;
end;
$$;

grant execute on function void_purchase(uuid, text) to authenticated;

-- ==========================================================================
-- 5) Abonos a compras a crédito
-- ==========================================================================
create or replace function register_supplier_payment(
  p_purchase_id uuid,
  p_amount numeric,
  p_source text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p purchases%rowtype;
  v_amount numeric(12, 2) := round(coalesce(p_amount, 0), 2);
  v_id uuid;
  v_name text;
begin
  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede registrar pagos a proveedores';
  end if;

  select * into v_p from purchases where id = p_purchase_id for update;
  if not found or v_p.organization_id is distinct from current_profile_org() then
    raise exception 'Compra no encontrada';
  end if;
  if v_p.voided_at is not null then
    raise exception 'Esta compra fue anulada';
  end if;
  if v_p.balance <= 0 then
    raise exception 'Esta compra ya está pagada';
  end if;
  if v_amount <= 0 then
    raise exception 'El pago debe ser mayor a cero';
  end if;
  if v_amount > v_p.balance then
    raise exception 'El pago (%) supera lo que se debe (%)', fmt_cop(v_amount), fmt_cop(v_p.balance);
  end if;
  if p_source not in ('caja', 'externo') then
    raise exception 'Indica si se pagó desde la caja o por fuera';
  end if;
  if p_source = 'caja' and exists (
    select 1 from cash_days
     where organization_id = v_p.organization_id and day = org_local_date(now()) and closed_at is not null
  ) then
    raise exception 'La caja de hoy ya está cerrada; reábrela para pagar desde la caja';
  end if;

  select full_name into v_name from profiles where id = auth.uid();

  insert into supplier_payments (organization_id, purchase_id, supplier_id, amount, source, notes, created_by, created_by_name)
  values (v_p.organization_id, v_p.id, v_p.supplier_id, v_amount, p_source,
          nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), v_name)
  returning id into v_id;

  update purchases set balance = balance - v_amount where id = v_p.id;
  return v_id;
end;
$$;

grant execute on function register_supplier_payment(uuid, numeric, text, text) to authenticated;

create or replace function void_supplier_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay supplier_payments%rowtype;
begin
  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede anular pagos a proveedores';
  end if;

  select * into v_pay from supplier_payments where id = p_payment_id for update;
  if not found or v_pay.organization_id is distinct from current_profile_org() then
    raise exception 'Pago no encontrado';
  end if;
  if v_pay.voided_at is not null then
    raise exception 'Este pago ya fue anulado';
  end if;
  if v_pay.source = 'caja' and exists (
    select 1 from cash_days
     where organization_id = v_pay.organization_id
       and day = org_local_date(v_pay.created_at)
       and closed_at is not null
  ) then
    raise exception 'La caja del día de este pago ya está cerrada; reábrela para anularlo';
  end if;

  update purchases set balance = balance + v_pay.amount where id = v_pay.purchase_id;
  update supplier_payments set voided_at = now(), voided_by = auth.uid() where id = p_payment_id;
end;
$$;

grant execute on function void_supplier_payment(uuid) to authenticated;

-- ==========================================================================
-- 6) Caja: pagos a proveedores desde la caja
-- ==========================================================================
alter table cash_days
  add column if not exists purchases_cash numeric(12, 2) not null default 0,
  add column if not exists supplier_payments_cash numeric(12, 2) not null default 0;

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
  abonos_otro numeric,
  purchases_cash numeric,
  supplier_payments_cash numeric
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
    (select coalesce(sum(ab.amount), 0) from ab where ab.method = 'otro'),
    (select coalesce(sum(p.total), 0) from purchases p
      where p.organization_id = v_org and p.voided_at is null and p.pay_source = 'caja'
        and p.created_at >= v_start and p.created_at < v_end),
    (select coalesce(sum(sp.amount), 0) from supplier_payments sp
      where sp.organization_id = v_org and sp.voided_at is null and sp.source = 'caja'
        and sp.created_at >= v_start and sp.created_at < v_end);
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

  -- Ventas/gastos manuales se asumen en efectivo. Devoluciones en efectivo y
  -- pagos a proveedores desde la caja salen; abonos de clientes en efectivo
  -- entran. Lo fiado no entra.
  v_expected := v_base + v_sm.sales_cash - v_sm.returns_cash + v_sm.abonos_cash
                + v_sm.manual_sales - v_sm.expenses
                - v_sm.purchases_cash - v_sm.supplier_payments_cash;

  select full_name into v_name from profiles where id = auth.uid();

  insert into cash_days (
    organization_id, day, base_amount, closed_at, closed_by, closed_by_name,
    sales_cash, sales_nequi, sales_daviplata, sales_llave,
    sales_tarjeta, sales_otro, sales_credito,
    returns_cash, returns_nequi, returns_daviplata, returns_llave,
    returns_tarjeta, returns_otro, returns_credito,
    abonos_cash, abonos_nequi, abonos_daviplata, abonos_llave, abonos_tarjeta, abonos_otro,
    purchases_cash, supplier_payments_cash,
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
    v_sm.purchases_cash, v_sm.supplier_payments_cash,
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
    purchases_cash = excluded.purchases_cash,
    supplier_payments_cash = excluded.supplier_payments_cash,
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
         purchases_cash = 0, supplier_payments_cash = 0,
         manual_sales = 0, expenses = 0, expected_cash = 0,
         counted_cash = null, difference = null, notes = null
   where organization_id = v_org and day = p_day;
end;
$$;

grant execute on function reopen_cash_day(date) to authenticated;
