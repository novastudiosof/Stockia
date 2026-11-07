-- Ejecutar después de 001-014. Idempotente.
--
-- 1) Seguridad (hallazgos de la revisión de código):
--    a) sales: se elimina la política de INSERT directo. Cualquier miembro del
--       negocio podía fabricar ventas con un total arbitrario, sin descontar
--       stock y en días ya cerrados. Las ventas solo se crean con create_sale()
--       (security definer), que no necesita esa política.
--    b) movements: el INSERT directo pasa a ser solo del owner (la aplicación
--       ya lo exigía) y se bloquea en días con cierre de caja.
--    c) bucket "invoices": solo el owner puede borrar archivos.
-- 2) Personalización por organización: tipo de negocio (define los íconos de
--    categorías sugeridos) y color principal de la interfaz.

-- ==========================================================================
-- 1a) sales: sin INSERT directo
-- ==========================================================================
drop policy if exists sales_insert on sales;

-- ==========================================================================
-- 1b) movements: INSERT solo owner y solo en días abiertos
-- ==========================================================================
drop policy if exists movements_insert on movements;
create policy movements_insert on movements for insert
  with check (
    organization_id = current_profile_org()
    and current_profile_role() = 'owner'
    and not exists (
      select 1 from cash_days cd
       where cd.organization_id = movements.organization_id
         and cd.day = movements.occurred_at
         and cd.closed_at is not null
    )
  );

-- ==========================================================================
-- 1c) bucket invoices: borrar solo owner
-- ==========================================================================
drop policy if exists invoices_bucket_delete on storage.objects;
create policy invoices_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = current_profile_org()::text
    and current_profile_role() = 'owner'
  );

-- ==========================================================================
-- 2) Tipo de negocio y color principal
-- ==========================================================================
alter table organizations
  add column if not exists business_type text not null default 'general',
  add column if not exists theme_color text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_theme_color_check'
  ) then
    alter table organizations
      add constraint organizations_theme_color_check
      check (theme_color is null or theme_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;
