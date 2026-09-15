"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeOrFilterTerm } from "@/lib/postgrest-filter";
import { clienteSchema } from "@/lib/validations/clientes";
import type { Cliente } from "@/lib/supabase/types";

// A diferencia de otras acciones del proyecto, create/updateCliente siempre
// devuelven un objeto (nunca `void`): el diálogo usa useActionState y
// necesita una referencia de estado distinta de `undefined` para detectar
// "guardado con éxito" y cerrarse/limpiar el formulario.
type ActionResult = { error?: string };

export interface ClienteSearchResult {
  results: Cliente[];
  error?: string;
}

/**
 * Autocompletar de clientes al vender: busca por nombre o documento dentro
 * de la propia organización. No expone clientes de otras organizaciones
 * (RLS ya lo impide, pero el filtro por organization_id evita el viaje extra).
 */
export async function searchClientes(query: string): Promise<ClienteSearchResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { results: [] };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const trimmed = query.trim();
  if (trimmed.length < 2) return { results: [] };

  const safe = sanitizeOrFilterTerm(trimmed);
  if (!safe) return { results: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .or(`nombre.ilike.%${safe}%,documento.ilike.%${safe}%`)
    .order("nombre", { ascending: true })
    .limit(8);

  if (error) {
    return { results: [], error: friendlyDbError(error, "searchClientes", "No se pudo buscar") };
  }
  return { results: data ?? [] };
}

export async function createCliente(
  _prev: ActionResult | void,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const parsed = clienteSchema.safeParse({
    nombre: formData.get("nombre"),
    documento: formData.get("documento") ?? "",
    telefono: formData.get("telefono") ?? "",
    email: formData.get("email") ?? "",
    direccion: formData.get("direccion") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").insert({
    organization_id: profile.organization_id,
    nombre: parsed.data.nombre,
    documento: parsed.data.documento || null,
    telefono: parsed.data.telefono || null,
    email: parsed.data.email || null,
    direccion: parsed.data.direccion || null,
  });
  if (error) return { error: friendlyDbError(error, "createCliente", "No se pudo crear el cliente") };

  await logActivity(profile, "Creó cliente", parsed.data.nombre);
  revalidatePath("/dashboard/clientes");
  return {};
}

export async function updateCliente(
  clienteId: string,
  _prev: ActionResult | void,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar clientes" };
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const parsed = clienteSchema.safeParse({
    nombre: formData.get("nombre"),
    documento: formData.get("documento") ?? "",
    telefono: formData.get("telefono") ?? "",
    email: formData.get("email") ?? "",
    direccion: formData.get("direccion") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clientes")
    .update({
      nombre: parsed.data.nombre,
      documento: parsed.data.documento || null,
      telefono: parsed.data.telefono || null,
      email: parsed.data.email || null,
      direccion: parsed.data.direccion || null,
    })
    .eq("id", clienteId);
  if (error) return { error: friendlyDbError(error, "updateCliente", "No se pudo actualizar el cliente") };

  await logActivity(profile, "Editó cliente", parsed.data.nombre);
  revalidatePath("/dashboard/clientes");
  return {};
}

export async function deleteCliente(clienteId: string, clienteNombre: string) {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede eliminar clientes" };
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { error } = await supabase.from("clientes").delete().eq("id", clienteId);
  if (error) return { error: friendlyDbError(error, "deleteCliente", "No se pudo eliminar el cliente") };

  await logActivity(profile, "Eliminó cliente", clienteNombre);
  revalidatePath("/dashboard/clientes");
}
