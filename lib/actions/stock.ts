"use server";

import { revalidatePath } from "next/cache";

import { requireProfile, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/db-errors";
import { minStockField, stockAlertSettingsSchema } from "@/lib/validations/stock";

const MIGRATION_027 = {
  PGRST204: "Falta ejecutar la migración 027 en Supabase",
  "42703": "Falta ejecutar la migración 027 en Supabase",
};

function revalidateStock() {
  revalidatePath("/dashboard", "layout");
}

/** Alertas de stock del negocio: encendidas/apagadas y mínimo general. */
export async function updateStockAlertSettings(input: {
  enabled: boolean;
  defaultMinStock: string | number;
}): Promise<{ error?: string; success?: string }> {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const parsed = stockAlertSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      stock_alerts_enabled: parsed.data.enabled,
      default_min_stock: parsed.data.defaultMinStock,
    })
    .eq("id", profile.organization_id);
  if (error) {
    return { error: friendlyDbError(error, "updateStockAlertSettings", "No se pudo guardar", MIGRATION_027) };
  }

  await logActivity(
    profile,
    "Actualizó alertas de stock",
    parsed.data.enabled ? `mínimo general ${parsed.data.defaultMinStock}` : "apagadas"
  );
  revalidateStock();
  return { success: "Alertas de stock guardadas" };
}

/** Cambia el stock mínimo de un producto (null = usa el general). */
export async function setProductMinStock(
  productId: string,
  value: string | number | null
): Promise<{ error?: string; success?: string }> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede cambiar el stock mínimo" };

  const parsed = minStockField.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ min_stock: parsed.data })
    .eq("id", productId)
    .eq("organization_id", profile.organization_id)
    .select("name")
    .maybeSingle();
  if (error) return { error: friendlyDbError(error, "setProductMinStock", "No se pudo guardar el mínimo", MIGRATION_027) };
  if (!data) return { error: "Producto no encontrado" };

  await logActivity(
    profile,
    "Cambió stock mínimo",
    `${(data as { name: string }).name}: ${parsed.data ?? "general"}`
  );
  revalidateStock();
  return { success: "Mínimo guardado" };
}
