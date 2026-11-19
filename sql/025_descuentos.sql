-- Ejecutar después de 001-024. Idempotente.
--
-- Descuentos en la venta:
--  - Por producto (ítem): en % o en valor ($), sobre lo que paga el cliente
--    por esa línea (precio final, con impuesto si lo tiene).
--  - A toda la venta: en % o en valor, sobre lo que queda después de los
--    descuentos por producto. Se reparte entre las líneas en proporción a su
--    valor (la línea más grande se queda con el redondeo), así el impuesto de
--    cada línea se calcula sobre lo que realmente se cobró.
--  - Los descuentos se redondean a pesos enteros.
--  - Tope para auxiliares: organizations.max_discount_pct (10 % por defecto)
--    sobre el valor de la venta antes de descuentos. El administrador no tiene
--    tope.
--  - Cada ítem guarda grossSubtotal (antes de descuentos), lineDiscount
--    (descuento propio del ítem) y discount (propio + su parte del de la
--    venta). subtotal sigue siendo lo que se cobró por la línea.
--  - sales.discount_total (todos los descuentos) y sales.global_discount
--    (el de toda la venta).
--  - La utilidad ya usa la base sin impuesto de cada línea (con el descuento).
--
-- IMPORTANTE: lib/discounts.ts replica este cálculo para mostrar el total en
-- el carrito; si se cambia uno, cambiar el otro.

alter table organizations
  add column if not exists max_discount_pct numeric(5, 2) not null default 10;

alter table organizations drop constraint if exists organizations_max_discount_check;
alter table organizations add constraint organizations_max_discount_check
  check (max_discount_pct between 0 and 100);

alter table sales
  add column if not exists discount_total numeric(12, 2) not null default 0,
  add column if not exists global_discount numeric(12, 2) not null default 0;

-- Nueva firma: se agrega p_discount (descuento a toda la venta). Se elimina la
-- anterior para no dejar dos funciones sobrecargadas.
drop function if exists create_sale(uuid, jsonb, uuid, jsonb, jsonb, text);

create or replace function create_sale(
  p_organization_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_customer_data jsonb default null,
  p_payment jsonb default null,
  p_customer_email text default null,
  p_discount jsonb default null
)
returns table (sale_id uuid, total numeric, sale_number int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_line jsonb;
  v_idx bigint;
  v_product products%rowtype;
  v_total numeric(12, 2) := 0;
  v_line_total numeric(12, 2);
  v_qty int;
  v_lines jsonb := '[]'::jsonb;
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
  -- descuentos
  v_dtype text;
  v_dval numeric;
  v_ld numeric(12, 2);
  v_gross numeric(12, 2) := 0;
  v_line_disc numeric(12, 2) := 0;
  v_net_sum numeric(12, 2);
  v_global numeric(12, 2) := 0;
  v_holder bigint;
  v_share numeric(12, 2);
  v_shares numeric(12, 2) := 0;
  v_net numeric(12, 2);
  v_disc numeric(12, 2);
  v_disc_total numeric(12, 2);
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

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

  -- 1) Cada línea: stock, valor con impuesto y descuento propio.
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

    v_dtype := coalesce(v_item->>'discountType', '');
    v_dval := coalesce(nullif(v_item->>'discountValue', '')::numeric, 0);
    if v_dval < 0 then
      raise exception 'El descuento no puede ser negativo';
    end if;
    if v_dval = 0 then
      v_ld := 0;
    elsif v_dtype = 'pct' then
      if v_dval > 100 then
        raise exception 'El descuento de "%" no puede pasar del 100%%', v_product.name;
      end if;
      v_ld := round(v_line_total * v_dval / 100);
    elsif v_dtype = 'amount' then
      v_ld := round(v_dval);
    else
      raise exception 'Tipo de descuento inválido';
    end if;
    if v_ld > v_line_total then
      raise exception 'El descuento de "%" supera su valor (%)', v_product.name, fmt_cop(v_line_total);
    end if;

    v_gross := v_gross + v_line_total;
    v_line_disc := v_line_disc + v_ld;

    v_lines := v_lines || jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'unitPrice', v_product.sale_price,
      'quantity', v_qty,
      'kind', v_product.tax_kind,
      'rate', v_rate,
      'gross', v_line_total,
      'base', v_base,
      'tax', v_tax,
      'ld', v_ld,
      'net', v_line_total - v_ld
    );
  end loop;

  -- 2) Descuento a toda la venta, sobre lo que queda.
  v_net_sum := v_gross - v_line_disc;
  v_dtype := coalesce(p_discount->>'type', '');
  v_dval := coalesce(nullif(p_discount->>'value', '')::numeric, 0);
  if v_dval < 0 then
    raise exception 'El descuento no puede ser negativo';
  end if;
  if v_dval = 0 then
    v_global := 0;
  elsif v_dtype = 'pct' then
    if v_dval > 100 then
      raise exception 'El descuento de la venta no puede pasar del 100%%';
    end if;
    v_global := round(v_net_sum * v_dval / 100);
  elsif v_dtype = 'amount' then
    v_global := round(v_dval);
  else
    raise exception 'Tipo de descuento inválido';
  end if;
  if v_global > v_net_sum then
    raise exception 'El descuento de la venta supera su valor (%)', fmt_cop(v_net_sum);
  end if;

  -- Tope del auxiliar (el administrador no tiene tope).
  v_disc_total := v_line_disc + v_global;
  if v_disc_total > 0 and current_profile_role() <> 'owner' and v_gross > 0
     and v_disc_total * 100 / v_gross > v_org.max_discount_pct + 0.001 then
    raise exception 'El descuento (% %%) supera el máximo permitido para auxiliares (% %%)',
      trim_scale(round(v_disc_total * 100 / v_gross, 1)), trim_scale(v_org.max_discount_pct);
  end if;

  -- La línea de mayor valor (la primera si hay empate) se queda con el redondeo.
  select t.ord into v_holder
    from jsonb_array_elements(v_lines) with ordinality t(l, ord)
   order by (t.l->>'net')::numeric desc, t.ord
   limit 1;

  if v_global > 0 then
    for v_line, v_idx in select t.l, t.ord from jsonb_array_elements(v_lines) with ordinality t(l, ord)
    loop
      if v_idx <> v_holder then
        v_shares := v_shares + round(v_global * (v_line->>'net')::numeric / v_net_sum, 2);
      end if;
    end loop;
  end if;

  -- 3) Ítems finales: lo cobrado por línea y su impuesto.
  for v_line, v_idx in select t.l, t.ord from jsonb_array_elements(v_lines) with ordinality t(l, ord)
  loop
    if v_global = 0 then
      v_share := 0;
    elsif v_idx = v_holder then
      v_share := v_global - v_shares;
    else
      v_share := round(v_global * (v_line->>'net')::numeric / v_net_sum, 2);
    end if;

    v_rate := (v_line->>'rate')::numeric;
    v_net := (v_line->>'net')::numeric - v_share;
    v_disc := (v_line->>'ld')::numeric + v_share;
    if v_disc = 0 then
      v_base := (v_line->>'base')::numeric;
      v_tax := (v_line->>'tax')::numeric;
    elsif v_rate > 0 then
      v_tax := round(v_net * v_rate / (100 + v_rate), 2);
      v_base := v_net - v_tax;
    else
      v_tax := 0;
      v_base := v_net;
    end if;

    v_total := v_total + v_net;
    v_tax_total := v_tax_total + v_tax;

    -- Paréntesis obligatorios: sin ellos el segundo objeto se agregaría como
    -- otro ítem del arreglo en vez de unirse a este.
    v_items_out := v_items_out || (jsonb_build_object(
      'productId', v_line->'productId',
      'name', v_line->'name',
      'unitPrice', v_line->'unitPrice',
      'quantity', v_line->'quantity',
      'subtotal', v_net,
      'taxKind', case when v_rate > 0 then v_line->>'kind' else null end,
      'taxRate', v_rate,
      'base', v_base,
      'tax', v_tax
    ) || case when v_disc > 0 then jsonb_build_object(
      'grossSubtotal', (v_line->>'gross')::numeric,
      'lineDiscount', (v_line->>'ld')::numeric,
      'discount', v_disc
    ) else '{}'::jsonb end);
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
    sold_by_name, customer_email, tax_total, discount_total, global_discount
  )
  values (
    p_organization_id, v_items_out, v_total, auth.uid(), v_customer_id, v_customer_snapshot,
    v_sale_number, v_method, v_cash, v_nequi, v_dav, v_llave,
    v_tarjeta, v_otro, case when v_otro > 0 then v_org.payment_other_label end,
    v_credit, v_credit, v_due,
    v_sold_by, v_email, v_tax_total, v_disc_total, v_global
  )
  returning id into v_sale_id;

  return query select v_sale_id, v_total, v_sale_number;
end;
$$;

grant execute on function create_sale(uuid, jsonb, uuid, jsonb, jsonb, text, jsonb) to authenticated;
