"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

type ActionResult = { error?: string; success?: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireCajaOwner() {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" as const };
  if (profile.role !== "owner") {
    return { error: "Solo el administrador puede manejar la caja" as const };
  }
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);
  return { profile };
}

export async function saveCashBase(day: string, base: number): Promise<ActionResult> {
  const auth = await requireCajaOwner();
  if ("error" in auth) return { error: auth.error };
  if (!DAY_RE.test(day)) return { error: "Fecha inválida" };
  if (!Number.isFinite(base) || base < 0) return { error: "La base debe ser un número positivo" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_cash_base", { p_day: day, p_base: base });
  if (error) return { error: friendlyDbError(error, "saveCashBase", "No se pudo guardar la base") };

  await logActivity(auth.profile, "Registró base de caja", `${day}: ${base}`);
  revalidatePath("/dashboard/ventas/cierre");
  return { success: "Base guardada" };
}

export async function closeCashDay(
  day: string,
  counted: number,
  notes: string
): Promise<ActionResult> {
  const auth = await requireCajaOwner();
  if ("error" in auth) return { error: auth.error };
  if (!DAY_RE.test(day)) return { error: "Fecha inválida" };
  if (!Number.isFinite(counted) || counted < 0) {
    return { error: "El efectivo contado debe ser un número positivo" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .rpc("close_cash_day", { p_day: day, p_counted: counted, p_notes: notes.trim() || null })
    .single();
  if (error) return { error: friendlyDbError(error, "closeCashDay", "No se pudo cerrar la caja") };

  await logActivity(auth.profile, "Cerró la caja", day);
  revalidatePath("/dashboard/ventas/cierre");
  revalidatePath("/dashboard/ventas");
  return { success: "Caja cerrada" };
}

export async function reopenCashDay(day: string): Promise<ActionResult> {
  const auth = await requireCajaOwner();
  if ("error" in auth) return { error: auth.error };
  if (!DAY_RE.test(day)) return { error: "Fecha inválida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_cash_day", { p_day: day });
  if (error) return { error: friendlyDbError(error, "reopenCashDay", "No se pudo reabrir la caja") };

  await logActivity(auth.profile, "Reabrió la caja", day);
  revalidatePath("/dashboard/ventas/cierre");
  revalidatePath("/dashboard/ventas");
  return { success: "Caja reabierta" };
}
