-- Ejecutar después de 001-021. Idempotente.
--
-- create_sale() no permite registrar ventas cuando la caja de HOY ya fue
-- cerrada: antes la venta se guardaba igual y el cierre quedaba desajustado
-- (el efectivo esperado ya no coincidía con las ventas del día).
-- La firma no cambia; solo se agrega la validación al inicio. Si hay que
-- vender después de cerrar, el administrador reabre la caja de hoy.

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
