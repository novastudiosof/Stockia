-- Ejecutar después de 001-011. Idempotente.
--
-- Tres correcciones encontradas en revisión de código:
--
-- 1) branding_bucket_insert/branding_bucket_delete (009) exigían
--    "carpeta = org actual Y ADEMÁS super_admin" en vez de "O" — como el
--    super_admin siempre tiene organization_id NULL (no pertenece a ninguna
--    organización), la condición nunca se cumplía y NINGÚN logo se podía
--    subir jamás. Se corrige a "O", igual que la política equivalente de
--    "invoices" en 004_storage.sql.
--
-- 2) create_product(): antes, crear un producto hacía el insert y el
--    movimiento de stock inicial como dos pasos separados desde la
--    aplicación (uno de ellos sin revisar su error), y el límite de
--    "productos por categoría" se validaba con un count() sin bloqueo —
--    dos altas simultáneas en una categoría casi llena podían pasarse del
--    límite. Ahora todo (bloqueo de fila de la organización, validación del
--    límite, insert del producto y su movimiento 'initial') ocurre en una
--    sola transacción atómica, igual que ya hacían create_sale/adjust_stock/
--    bulk_import_products.
--
-- 3) bulk_import_products(): hacía un `select count(*) from products` por
--    cada fila del Excel, aunque muchas filas compartan categoría — en un
--    archivo de miles de filas eso repite el mismo conteo cientos de veces.
--    Ahora el conteo base de cada categoría se calcula una sola vez y se
--    cachea en memoria durante el resto del loop.

-- ==========================================================================
-- 1) Bucket "branding": permitir logo también al super_admin
-- ==========================================================================
drop policy if exists branding_bucket_insert on storage.objects;
create policy branding_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = current_profile_org()::text
      or is_super_admin()
    )
  );

drop policy if exists branding_bucket_delete on storage.objects;
create policy branding_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'branding'
    and (
      (storage.foldername(name))[1] = current_profile_org()::text
      or is_super_admin()
    )
  );

-- ==========================================================================
-- 2) create_product(): alta de producto atómica (límite + insert + ledger)
-- ==========================================================================
create or replace function create_product(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_quantity int,
  p_description text,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_barcode text
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations%rowtype;
  v_current_count int;
  v_product products%rowtype;
begin
  if p_organization_id is distinct from current_profile_org() then
    raise exception 'No autorizado';
  end if;

  if current_profile_role() <> 'owner' then
    raise exception 'Solo el administrador puede crear productos';
  end if;

  if not exists (
    select 1 from categories where id = p_category_id and organization_id = p_organization_id
  ) then
    raise exception 'Categoría no encontrada';
  end if;

  select * into v_org from organizations where id = p_organization_id for update;

  select count(*) into v_current_count from products where category_id = p_category_id;
  if v_current_count >= v_org.max_productos_por_categoria then
    raise exception 'Alcanzaste el máximo de % productos por categoría de tu plan', v_org.max_productos_por_categoria;
  end if;

  insert into products
    (organization_id, category_id, name, quantity, description, purchase_price, sale_price, barcode)
  values (
    p_organization_id, p_category_id, p_name, coalesce(p_quantity, 0),
    nullif(p_description, ''), coalesce(p_purchase_price, 0), coalesce(p_sale_price, 0),
    nullif(p_barcode, '')
  )
  returning * into v_product;

  if v_product.quantity > 0 then
    insert into stock_movements
      (organization_id, product_id, delta, previous_quantity, new_quantity, reason, source, created_by)
    values
      (p_organization_id, v_product.id, v_product.quantity, 0, v_product.quantity, 'Carga inicial', 'initial', auth.uid());
  end if;

  return v_product;
end;
$$;

grant execute on function create_product(uuid, uuid, text, int, text, numeric, numeric, text) to authenticated;

-- La carga inicial ahora siempre pasa por create_product(), que corre con
-- "security definer" y se salta RLS — ya no hace falta que el cliente
-- inserte directamente en stock_movements, así que se retira ese permiso.
drop policy if exists stock_movements_insert on stock_movements;

-- ==========================================================================
-- 3) bulk_import_products(): cachear el conteo base por categoría
-- ==========================================================================
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

    -- El conteo base de cada categoría se calcula una sola vez (la primera
    -- fila del archivo que la usa) y de ahí en adelante se toma del cache.
    if v_counts ? v_category_id::text then
      v_current_count := (v_counts->>v_category_id::text)::int;
    else
      select count(*) into v_current_count from products where category_id = v_category_id;
    end if;

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
