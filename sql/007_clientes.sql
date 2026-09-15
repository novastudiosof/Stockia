-- Ejecutar después de 001-006. Idempotente.
--
-- Tabla de clientes: cada organización guarda los suyos, capturados al
-- vender desde "Ventas por Productos" (ver 009_facturacion_organizacion.sql,
-- que conecta `sales` con esta tabla) y reutilizables por nombre/documento en
-- ventas futuras.

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  nombre text not null,
  documento text,
  telefono text,
  email text,
  direccion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clientes_organization_id_idx on clientes (organization_id);

drop trigger if exists clientes_set_updated_at on clientes;
create trigger clientes_set_updated_at
  before update on clientes
  for each row execute function set_updated_at();

alter table clientes enable row level security;

drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select
  using (organization_id = current_profile_org() or is_super_admin());

-- El auxiliar también puede dar de alta un cliente nuevo al vender.
drop policy if exists clientes_insert on clientes;
create policy clientes_insert on clientes for insert
  with check (organization_id = current_profile_org());

drop policy if exists clientes_update on clientes;
create policy clientes_update on clientes for update
  using (organization_id = current_profile_org() and current_profile_role() = 'owner')
  with check (organization_id = current_profile_org() and current_profile_role() = 'owner');

drop policy if exists clientes_delete on clientes;
create policy clientes_delete on clientes for delete
  using (organization_id = current_profile_org() and current_profile_role() = 'owner');
