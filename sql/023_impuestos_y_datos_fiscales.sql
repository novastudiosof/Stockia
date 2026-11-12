-- Ejecutar después de 001-022. Idempotente.
--
-- Impuestos (IVA / impuesto al consumo) y datos fiscales: preparación para la
-- facturación electrónica. TODO queda apagado por defecto: mientras el negocio
-- no active "Manejar impuestos" en Mi Cuenta, nada cambia en precios, ventas ni
-- informes.
--
--  - organizations: tax_enabled (activar impuestos), prices_include_tax (los
--    precios ya incluyen el impuesto, o se suma encima) y datos fiscales
--    (DV, régimen, ciudad, responsabilidades, resolución de numeración).
--  - products: tax_kind (iva / consumo / exento / excluido) y tax_rate (%).
--  - clientes: tipo_documento.
--  - sales: tax_total. Cada ítem guarda taxKind, taxRate, base y tax.
--  - create_sale() calcula el impuesto en el servidor. Mantiene la validación
--    de caja cerrada de la 022.
--  - La utilidad usa el ingreso SIN impuesto (el IVA no es ingreso del negocio).

alter table organizations
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists prices_include_tax boolean not null default true,
  add column if not exists tax_dv text,
  add column if not exists tax_regime text,
  add column if not exists billing_city text,
  add column if not exists tax_responsibilities text,
  add column if not exists invoice_resolution_number text,
  add column if not exists invoice_resolution_from int,
  add column if not exists invoice_resolution_to int,
  add column if not exists invoice_resolution_valid_until date;

alter table products
  add column if not exists tax_kind text not null default 'excluido',
  add column if not exists tax_rate numeric(5, 2) not null default 0;

alter table products drop constraint if exists products_tax_check;
alter table products add constraint products_tax_check check (
  tax_kind in ('iva', 'consumo', 'exento', 'excluido')
  and tax_rate >= 0 and tax_rate <= 100
  and (tax_kind in ('iva', 'consumo') or tax_rate = 0)
);

alter table clientes
  add column if not exists tipo_documento text;

alter table sales
  add column if not exists tax_total numeric(12, 2) not null default 0;

-- ==========================================================================
-- sales_effects(): ahora también devuelve el impuesto de cada venta.
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
  pay_llave numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.created_at, 1, s.total::numeric, s.tax_total::numeric, s.items,
         s.pay_cash::numeric, s.pay_nequi::numeric, s.pay_daviplata::numeric, s.pay_llave::numeric
    from sales s
   where s.organization_id = p_org
     and (s.voided_at is null or s.void_kind = 'devolucion')
     and (p_start is null or s.created_at >= p_start)
     and (p_end is null or s.created_at < p_end)
  union all
  select s.id, s.voided_at, -1, s.total::numeric, s.tax_total::numeric, s.items,
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
-- Utilidad: ingreso sin impuesto
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
    (select coalesce(sum((s.total - s.tax_total) * s.sign), 0) from s),
    c.cost,
    (select coalesce(sum((s.total - s.tax_total) * s.sign), 0) from s) - c.cost,
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
    sum(e.sign * coalesce((i->>'base')::numeric, (i->>'subtotal')::numeric)),
    sum(e.sign * (i->>'quantity')::numeric * coalesce((i->>'unitCost')::numeric, 0)),
    sum(e.sign * coalesce((i->>'base')::numeric, (i->>'subtotal')::numeric))
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
    sum((e.total - e.tax_total) * e.sign),
    sum(e.sign * x.cost),
    sum((e.total - e.tax_total) * e.sign) - sum(e.sign * x.cost)
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

-- ==========================================================================
-- create_sale(): calcula el impuesto en el servidor
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
    sold_by_name, customer_email, tax_total
  )
  values (
    p_organization_id, v_items_out, v_total, auth.uid(), v_customer_id, v_customer_snapshot,
    v_sale_number, v_method, v_cash, v_nequi, v_dav, v_llave,
    v_sold_by, v_email, v_tax_total
  )
  returning id into v_sale_id;

  return query select v_sale_id, v_total, v_sale_number;
end;
$$;

grant execute on function create_sale(uuid, jsonb, uuid, jsonb, jsonb, text) to authenticated;

