# Stockia

Software de inventario multi-negocio (Next.js + Supabase), desarrollado por
NOVA STUDIO. Un solo código y una sola base de datos sirven a todos los
clientes que lo compren (FerreAmigo es uno de ellos), aislados entre sí por
organización y con módulos que se activan/desactivan por cliente desde el
panel de super administrador.

## 1. Crear el proyecto de Supabase

1. Crea una cuenta/proyecto en [supabase.com](https://supabase.com).
2. En **Project Settings → API**, copia `Project URL`, `anon public key` y
   `service_role key`.
3. Copia `.env.example` a `.env.local` y completa esos valores.
4. En el **SQL Editor** de Supabase, ejecuta en orden los archivos de `sql/`:
   `001_schema.sql`, `002_rls_policies.sql`, `003_seed_modules.sql`,
   `004_storage.sql`.

## 2. Crear el primer super administrador

Este paso se hace una sola vez, a mano (no existe UI para crear el primer
super admin, a propósito — solo tú debes poder crearlo):

```bash
node --env-file=.env.local scripts/bootstrap-super-admin.mjs <usuario> <contraseña> "<Tu nombre>"
```

## 3. Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), inicia sesión con el
usuario del super admin y entra a **Super Admin** para crear tu primera
organización (negocio) y su usuario administrador (owner).

## 4. Desplegar en Vercel

1. Sube este repositorio a GitHub.
2. En [vercel.com](https://vercel.com), importa el repositorio.
3. En **Settings → Environment Variables**, agrega las mismas variables de
   `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_INVOICES_BUCKET`).
4. Despliega. Cada push a la rama principal vuelve a desplegar automáticamente.

## Cómo vender el sistema a un nuevo negocio

1. Como super admin, entra a **Super Admin → Nueva organización** y crea el
   negocio con su usuario administrador (owner) y contraseña inicial.
2. Activa los módulos pagos que haya contratado (Ventas y Gastos, Facturas)
   desde el detalle de esa organización.
3. Ajusta cuántos usuarios auxiliares incluye su plan.
4. Entrega al cliente su usuario y contraseña; el resto (categorías,
   productos, ventas, facturas) lo carga él mismo desde el sistema.

## Arquitectura

- **Next.js (App Router) + TypeScript + Tailwind CSS.**
- **Supabase**: Postgres (multi-tenant compartido con `organization_id` +
  Row Level Security), Auth (login por usuario, no por email — ver
  `app/api/auth/login/route.ts`) y Storage (adjuntos de facturas).
- **Roles**: `super_admin` (tú), `owner` (dueño del negocio, uno por
  organización), `auxiliar` (creado por el owner, limitado por
  `organizations.max_auxiliares`).
- **Módulos pagos**: `modules` + `organization_modules`, activados/desactivados
  manualmente desde `/superadmin`. El gating se valida en cada página y en
  cada server action del módulo (`lib/modules.ts`), no solo en el menú.
