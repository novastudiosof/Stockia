// Lista los usuarios (profiles) existentes: username, rol, organización.
// Se ejecuta a mano desde tu máquina:
//
//   node scripts/list-users.mjs
//
// Requiere las variables de entorno NEXT_PUBLIC_SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY (las mismas que usará la app, ver .env.example).

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: profiles, error } = await supabase
  .from("profiles")
  .select("username, role, organization_id, full_name, created_at, organizations(name)")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Error consultando profiles:", error);
  process.exit(1);
}

if (!profiles || profiles.length === 0) {
  console.log("No hay usuarios registrados.");
  process.exit(0);
}

const rows = profiles.map((p) => ({
  username: p.username,
  rol: p.role,
  organizacion: p.organizations?.name ?? "-",
  nombre_completo: p.full_name,
  creado: p.created_at,
}));

console.table(rows);
