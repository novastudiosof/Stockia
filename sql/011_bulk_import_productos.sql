-- Ejecutar después de 001-010. Idempotente.
--
-- Importación masiva de productos desde Excel: la acción del servidor
-- (lib/actions/catalogo.ts::bulkImportProducts) valida CADA fila primero
-- (categoría existente, precios/cantidad válidos) y solo si todas pasan
-- llama a esta función, que inserta todo en una sola transacción — si algo
-- falla acá (p.ej. el límite de productos por categoría cambió justo en ese
-- momento) no se inserta nada, igual que create_sale.

create or replace function bulk_import_products(p_organization_id uuid, p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_org organizations%rowtype;
  v_category_id uuid;
  v_qty int;
  v_new_product_id uuid;
  v_counts jsonb := '{}'::jsonb;
  v_current_count int;
  v_inserted int := 0;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede importar productos';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos para importar';
  end if;

  select * into v_org from organizations where id = p_organization_id for update;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_category_id := (v_item->>'categoryId')::uuid;

    if not exists (
      select 1 from categories
        where id = v_category_id and organization_id = p_organization_id
    ) then
      raise exception 'Una de las categorías del archivo ya no existe';
    end if;

    v_current_count := coalesce((select count(*) from products where category_id = v_category_id), 0)
      + coalesce((v_counts->>v_category_id::text)::int, 0);

    if v_current_count >= v_org.max_productos_por_categoria then
      raise exception 'Se alcanzó el máximo de % productos por categoría del plan', v_org.max_productos_por_categoria;
    end if;

    v_counts := jsonb_set(v_counts, array[v_category_id::text], to_jsonb(v_current_count + 1), true);

    v_qty := coalesce((v_item->>'quantity')::int, 0);

    insert into products
      (organization_id, category_id, name, quantity, description, purchase_price, sale_price, barcode)
    values (
      p_organization_id,
      v_category_id,
      v_item->>'name',
      v_qty,
      nullif(v_item->>'description', ''),
      coalesce((v_item->>'purchasePrice')::numeric, 0),
      coalesce((v_item->>'salePrice')::numeric, 0),
      nullif(v_item->>'barcode', '')
    )
    returning id into v_new_product_id;

    if v_qty > 0 then
      insert into stock_movements
        (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
      values
        (p_organization_id, v_new_product_id, v_qty, 0, v_qty, 'Carga inicial por importación', 'import', auth.uid());
    end if;

    v_inserted := v_inserted + 1;
  end loop;

  return v_inserted;
end;
$$;

grant execute on function bulk_import_products(uuid, jsonb) to authenticated;
