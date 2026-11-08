"use server";

import { z } from "zod";

import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { SaleDraft, SaleDraftState } from "@/lib/supabase/types";

// Los borradores más viejos que esto se limpian solos.
const DRAFT_MAX_AGE_DAYS = 3;

const text = (max: number) => z.string().max(max);

const draftStateSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(100000) }))
    .max(300),
  customerMode: z.enum(["none", "existing", "new"]),
  selectedCustomer: z
    .object({
      id: z.string().uuid(),
      organization_id: z.string().uuid(),
      nombre: text(200),
      documento: text(60).nullable(),
      telefono: text(60).nullable(),
      email: text(200).nullable(),
      direccion: text(300).nullable(),
      created_at: text(40),
      updated_at: text(40),
    })
    .nullable(),
  newCustomer: z.object({
    nombre: text(200),
    documento: text(60),
    telefono: text(60),
    direccion: text(300),
  }),
  customerEmail: text(200),
  whatsapp: text(60),
  cashReceived: text(20),
  payMethod: z.enum(["efectivo", "transferencia", "mixto"]),
  channel: z.enum(["nequi", "daviplata", "llave"]),
  mixed: z.object({
    efectivo: text(20),
    nequi: text(20),
    daviplata: text(20),
    llave: text(20),
  }),
});

const MIGRATION_HINT = {
  "42P01": "Falta ejecutar la migración 020 en Supabase",
  PGRST205: "Falta ejecutar la migración 020 en Supabase",
  "42703": "Falta ejecutar la migración 020 en Supabase",
};

export async function listSaleDrafts(): Promise<SaleDraft[]> {
  const profile = await requireProfile();
  if (!profile.organization_id) return [];
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const since = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 86400000).toISOString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sale_drafts")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data as SaleDraft[]) ?? [];
}

/**
 * Crea o actualiza un borrador. Solo lo actualiza su responsable:
 * - gone: true  -> ya no existe (otro usuario lo terminó o lo descartó).
 * - taken: true -> ahora lo tiene otro usuario.
 * En ambos casos NO se crea uno nuevo, para no resucitar una venta ya cobrada
 * ni pisar el trabajo de otra persona.
 */
export async function saveSaleDraft(
  draftId: string | null,
  state: SaleDraftState,
  total: number
): Promise<{ id?: string; gone?: boolean; taken?: boolean; error?: string }> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const parsed = draftStateSchema.safeParse(state);
  if (!parsed.success) return { error: "Borrador inválido" };
  const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0;

  const supabase = await createClient();

  if (draftId) {
    const { data, error } = await supabase
      .from("sale_drafts")
      .update({ state: parsed.data, total: safeTotal })
      .eq("id", draftId)
      .eq("organization_id", profile.organization_id)
      .eq("assigned_to", profile.id)
      .select("id");
    if (error) {
      return { error: friendlyDbError(error, "saveSaleDraft:update", "No se pudo guardar el borrador", MIGRATION_HINT) };
    }
    if (data && data.length > 0) return { id: draftId };

    const { data: still } = await supabase
      .from("sale_drafts")
      .select("id")
      .eq("id", draftId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    return still ? { taken: true } : { gone: true };
  }

  const { data, error } = await supabase
    .from("sale_drafts")
    .insert({
      organization_id: profile.organization_id,
      state: parsed.data,
      total: safeTotal,
      created_by: profile.id,
      created_by_name: profile.full_name,
      assigned_to: profile.id,
      assigned_to_name: profile.full_name,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { error: friendlyDbError(error, "saveSaleDraft:insert", "No se pudo guardar el borrador", MIGRATION_HINT) };
  }

  // Limpieza de borradores abandonados (una consulta barata, solo al crear).
  const cutoff = new Date(Date.now() - DRAFT_MAX_AGE_DAYS * 86400000).toISOString();
  await supabase
    .from("sale_drafts")
    .delete()
    .eq("organization_id", profile.organization_id)
    .lt("updated_at", cutoff);

  return { id: data.id as string };
}

/** El responsable (o el administrador) pasa la venta en espera a otro usuario. */
export async function transferSaleDraft(
  draftId: string,
  toUserId: string
): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", toUserId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!target) return { error: "Ese usuario no pertenece a este negocio" };

  let query = supabase
    .from("sale_drafts")
    .update({ assigned_to: target.id, assigned_to_name: target.full_name })
    .eq("id", draftId)
    .eq("organization_id", profile.organization_id);
  if (profile.role !== "owner") query = query.eq("assigned_to", profile.id);
  const { data, error } = await query.select("id");
  if (error) return { error: friendlyDbError(error, "transferSaleDraft", "No se pudo pasar la venta", MIGRATION_HINT) };
  if (!data || data.length === 0) return { error: "No puedes pasar esta venta: ya no es tuya" };
  return {};
}

/** El administrador toma una venta en espera que tiene otro usuario. */
export async function takeSaleDraft(draftId: string): Promise<{ draft?: SaleDraft; error?: string }> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede tomar una venta de otro usuario" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_drafts")
    .update({ assigned_to: profile.id, assigned_to_name: profile.full_name })
    .eq("id", draftId)
    .eq("organization_id", profile.organization_id)
    .select("*");
  if (error) return { error: friendlyDbError(error, "takeSaleDraft", "No se pudo tomar la venta", MIGRATION_HINT) };
  if (!data || data.length === 0) return { error: "Esa venta ya no existe" };
  return { draft: data[0] as SaleDraft };
}

export async function deleteSaleDraft(draftId: string): Promise<{ error?: string }> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { error } = await supabase
    .from("sale_drafts")
    .delete()
    .eq("id", draftId)
    .eq("organization_id", profile.organization_id);
  if (error) return { error: friendlyDbError(error, "deleteSaleDraft", "No se pudo descartar el borrador") };
  return {};
}
