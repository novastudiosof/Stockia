-- Ejecutar después de 001-019. Idempotente.
--
-- Borradores de venta ("ventas en espera"): el carrito que se está armando en
-- Ventas por Productos se guarda aquí para no perderlo al cambiar de módulo,
-- recargar o cerrar la pestaña.
--
-- Varias personas pueden vender a la vez: cada borrador tiene un responsable
-- (assigned_to), que es quien lo inició. Todos los usuarios del negocio lo
-- ven (con quién lo inició y quién lo tiene ahora), pero solo el responsable
-- lo edita. Para que otro usuario lo termine, el responsable se lo pasa; el
-- administrador también puede tomarlo. Al confirmarse la venta, se elimina.

create table if not exists sale_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  state jsonb not null,
  total numeric not null default 0,
  created_by uuid references profiles (id) on delete set null,
  created_by_name text,
  assigned_to uuid references profiles (id) on delete set null,
  assigned_to_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sale_drafts_org_updated_idx
  on sale_drafts (organization_id, updated_at desc);

drop trigger if exists sale_drafts_set_updated_at on sale_drafts;
create trigger sale_drafts_set_updated_at
  before update on sale_drafts
  for each row execute function set_updated_at();

alter table sale_drafts enable row level security;

drop policy if exists sale_drafts_select on sale_drafts;
create policy sale_drafts_select on sale_drafts for select
  using (organization_id = current_profile_org());

drop policy if exists sale_drafts_insert on sale_drafts;
create policy sale_drafts_insert on sale_drafts for insert
  with check (organization_id = current_profile_org());

-- Editar, pasar o descartar: el responsable, cualquiera si no tiene
-- responsable, o el administrador del negocio.
drop policy if exists sale_drafts_update on sale_drafts;
create policy sale_drafts_update on sale_drafts for update
  using (
    organization_id = current_profile_org()
    and (assigned_to is null or assigned_to = auth.uid() or current_profile_role() = 'owner')
  )
  with check (organization_id = current_profile_org());

drop policy if exists sale_drafts_delete on sale_drafts;
create policy sale_drafts_delete on sale_drafts for delete
  using (
    organization_id = current_profile_org()
    and (assigned_to is null or assigned_to = auth.uid() or current_profile_role() = 'owner')
  );
