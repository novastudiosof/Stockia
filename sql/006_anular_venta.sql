-- Ejecutar después de 001-005. Idempotente.
--
-- Permite al owner anular una venta registrada desde "Ventas por Productos":
-- devuelve el stock de cada producto vendido y marca la venta como anulada
-- (no se borra, queda como historial con voided_at/voided_by).

alter table sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references profiles (id) on delete set null;

-- void_sale(): solo el owner de la organización dueña de la venta puede
-- anularla, y solo una vez. Corre con "security definer" porque restaura
-- `products.quantity`, que la política products_update ya restringe a
-- owner — aquí igual se valida el rol explícitamente por claridad.
create or replace function void_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales%rowtype;
  v_item jsonb;
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

  for v_item in select * from jsonb_array_elements(v_sale.items)
  loop
    update products
      set quantity = quantity + (v_item->>'quantity')::int
      where id = (v_item->>'productId')::uuid;
  end loop;

  update sales
    set voided_at = now(), voided_by = auth.uid()
    where id = p_sale_id;
end;
$$;

grant execute on function void_sale(uuid) to authenticated;
