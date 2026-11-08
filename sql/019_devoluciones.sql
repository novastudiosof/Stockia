-- Ejecutar después de 001-018. Idempotente.
--
-- Devoluciones: el administrador puede marcar una venta como "devuelta"
-- (siempre la venta completa y por su valor total). Funciona igual que una
-- anulación (regresa el stock y la venta sale de informes y caja) pero queda
-- registrada como devolución, con motivo opcional.
-- Si el cliente devuelve solo algunos productos: se devuelve la venta completa
-- y se registra de nuevo una venta con los productos que se queda.

alter table sales
  add column if not exists void_kind text check (void_kind in ('anulacion', 'devolucion')),
  add column if not exists void_reason text;

-- Las ventas ya anuladas quedan como anulaciones.
update sales set void_kind = 'anulacion' where voided_at is not null and void_kind is null;

-- Se reemplaza la firma anterior void_sale(uuid) para no dejar sobrecargas ambiguas.
drop function if exists void_sale(uuid);

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
