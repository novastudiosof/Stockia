-- Bucket privado para los archivos adjuntos de facturas. Ejecutar después
-- de 002_rls_policies.sql (usa current_profile_org()/is_super_admin()).

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Los archivos se guardan como "<organization_id>/<nombre-archivo>", así que
-- basta con comparar el primer segmento de la ruta con la organización del
-- usuario autenticado.
drop policy if exists invoices_bucket_select on storage.objects;
create policy invoices_bucket_select on storage.objects for select
  using (
    bucket_id = 'invoices'
    and (
      (storage.foldername(name))[1] = current_profile_org()::text
      or is_super_admin()
    )
  );

drop policy if exists invoices_bucket_insert on storage.objects;
create policy invoices_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = current_profile_org()::text
  );

drop policy if exists invoices_bucket_delete on storage.objects;
create policy invoices_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = current_profile_org()::text
  );
