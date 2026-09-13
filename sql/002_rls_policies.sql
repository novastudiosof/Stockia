-- Políticas de Row Level Security: aíslan los datos de cada organización
-- dentro de la misma base de datos compartida, y le dan al super_admin
-- visibilidad/control global. Ejecutar después de 001_schema.sql.

-- Funciones "security definer": leen profiles sin volver a disparar RLS
-- sobre profiles (evita recursión infinita al usarlas dentro de las
-- políticas de la propia tabla profiles).
create or replace function current_profile_org()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from profiles where id = auth.uid()
$$;

create or replace function current_profile_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(current_profile_role() = 'super_admin', false)
$$;

-- ==========================================================================
-- organizations
-- ==========================================================================
alter table organizations enable row level security;

drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select
  using (id = current_profile_org() or is_super_admin());

drop policy if exists organizations_write on organizations;
create policy organizations_write on organizations for all
  using (is_super_admin())
  with check (is_super_admin());

-- ==========================================================================
-- profiles
-- ==========================================================================
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    id = auth.uid()
    or organization_id = current_profile_org()
    or is_super_admin()
  );

-- Los perfiles se crean/eliminan siempre desde route handlers con la
-- service role key (que se salta RLS), nunca desde el cliente directamente.
drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles for update
  using (id = auth.uid() or is_super_admin())
  with check (id = auth.uid() or is_super_admin());

-- ==========================================================================
-- modules (catálogo, solo lectura desde el cliente)
-- ==========================================================================
alter table modules enable row level security;

drop policy if exists modules_select on modules;
create policy modules_select on modules for select
  using (auth.role() = 'authenticated');

-- ==========================================================================
-- organization_modules
-- ==========================================================================
alter table organization_modules enable row level security;

drop policy if exists organization_modules_select on organization_modules;
create policy organization_modules_select on organization_modules for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists organization_modules_write on organization_modules;
create policy organization_modules_write on organization_modules for all
  using (is_super_admin())
  with check (is_super_admin());

-- ==========================================================================
-- categories / products / movements / invoices:
-- lectura y escritura solo dentro de la propia organización (owner y
-- auxiliar por igual); el super_admin solo puede leer (soporte), no editar
-- datos de negocio de sus clientes.
-- ==========================================================================
alter table categories enable row level security;

drop policy if exists categories_select on categories;
create policy categories_select on categories for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists categories_write on categories;
create policy categories_write on categories for insert
  with check (organization_id = current_profile_org());

drop policy if exists categories_update on categories;
create policy categories_update on categories for update
  using (organization_id = current_profile_org())
  with check (organization_id = current_profile_org());

drop policy if exists categories_delete on categories;
create policy categories_delete on categories for delete
  using (organization_id = current_profile_org());

alter table products enable row level security;

drop policy if exists products_select on products;
create policy products_select on products for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists products_insert on products;
create policy products_insert on products for insert
  with check (organization_id = current_profile_org());

drop policy if exists products_update on products;
create policy products_update on products for update
  using (organization_id = current_profile_org())
  with check (organization_id = current_profile_org());

drop policy if exists products_delete on products;
create policy products_delete on products for delete
  using (organization_id = current_profile_org());

alter table movements enable row level security;

drop policy if exists movements_select on movements;
create policy movements_select on movements for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists movements_insert on movements;
create policy movements_insert on movements for insert
  with check (organization_id = current_profile_org());

drop policy if exists movements_update on movements;
create policy movements_update on movements for update
  using (organization_id = current_profile_org())
  with check (organization_id = current_profile_org());

drop policy if exists movements_delete on movements;
create policy movements_delete on movements for delete
  using (organization_id = current_profile_org());

alter table invoices enable row level security;

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select
  using (organization_id = current_profile_org() or is_super_admin());

drop policy if exists invoices_insert on invoices;
create policy invoices_insert on invoices for insert
  with check (organization_id = current_profile_org());

drop policy if exists invoices_update on invoices;
create policy invoices_update on invoices for update
  using (organization_id = current_profile_org())
  with check (organization_id = current_profile_org());

drop policy if exists invoices_delete on invoices;
create policy invoices_delete on invoices for delete
  using (organization_id = current_profile_org());

-- ==========================================================================
-- activity_log: cualquier miembro de la organización puede insertar (para
-- registrar sus propias acciones); solo owner/super_admin pueden leerlo.
-- ==========================================================================
alter table activity_log enable row level security;

drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log for select
  using (
    (organization_id = current_profile_org() and current_profile_role() in ('owner', 'super_admin'))
    or is_super_admin()
  );

drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log for insert
  with check (organization_id = current_profile_org());
