-- Esquema del sistema de inventario multi-tenant.
-- Ejecutar en el editor SQL de Supabase, en orden (001, 002, 003).
-- Idempotente: se puede volver a correr sin romper nada.

create extension if not exists pgcrypto;

-- ==========================================================================
-- organizations: cada negocio que compra el software (ferretería, panadería...)
-- ==========================================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  max_auxiliares int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ==========================================================================
-- profiles: extiende auth.users con rol, organización y username propio
-- (el login es por username, no por email; auth_email es el correo sintético
-- interno que Supabase Auth exige pero que nunca se muestra ni se usa).
-- ==========================================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references organizations (id) on delete cascade,
  username text not null unique,
  full_name text not null,
  auth_email text not null unique,
  role text not null check (role in ('super_admin', 'owner', 'auxiliar')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_organization_id_idx on profiles (organization_id);

-- ==========================================================================
-- modules: catálogo de módulos vendibles (no incluye Catálogo ni Actividad,
-- que son parte del núcleo / se rigen por rol, no por compra).
-- ==========================================================================
create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists organization_modules (
  organization_id uuid not null references organizations (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  primary key (organization_id, module_id)
);

-- ==========================================================================
-- categories / products
-- ==========================================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  color text not null default '#F59E0B',
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists categories_organization_id_idx on categories (organization_id);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  name text not null,
  quantity int not null default 0,
  description text,
  purchase_price numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_organization_id_idx on products (organization_id);
create index if not exists products_category_id_idx on products (category_id);

-- ==========================================================================
-- movements: ventas y gastos (módulo "Ventas y Gastos")
-- ==========================================================================
create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  type text not null check (type in ('venta', 'gasto')),
  amount numeric(12, 2) not null,
  description text,
  occurred_at date not null default current_date,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movements_organization_id_idx on movements (organization_id);

-- ==========================================================================
-- invoices: módulo "Facturas" (archivo real en Supabase Storage)
-- ==========================================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  provider text not null,
  invoice_number text not null,
  amount numeric(12, 2) not null default 0,
  occurred_at date not null default current_date,
  file_path text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoices_organization_id_idx on invoices (organization_id);

-- ==========================================================================
-- activity_log: registro de actividad (visible para owner/super_admin)
-- ==========================================================================
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  username text not null,
  role text not null,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_organization_id_idx on activity_log (organization_id);

-- updated_at automático en products
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_set_updated_at on products;
create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- El username es la credencial pública de login: una vez creado, nadie
-- (ni siquiera un update directo) puede cambiarlo. Solo la contraseña
-- (en auth.users) es modificable por el propio usuario.
create or replace function prevent_username_change()
returns trigger as $$
begin
  if new.username <> old.username then
    raise exception 'El nombre de usuario no se puede modificar';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_prevent_username_change on profiles;
create trigger profiles_prevent_username_change
  before update on profiles
  for each row execute function prevent_username_change();
