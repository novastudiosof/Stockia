"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { movementSchema } from "@/lib/validations/ventas";

type ActionResult = { error?: string } | void;

export async function createMovement(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const parsed = movementSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    description: formData.get("description") ?? "",
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("movements").insert({
    organization_id: profile.organization_id,
    type: parsed.data.type,
    amount: parsed.data.amount,
    description: parsed.data.description || null,
    occurred_at: parsed.data.occurredAt,
    created_by: profile.id,
  });
  if (error) return { error: "No se pudo registrar el movimiento" };

  await logActivity(
    profile,
    parsed.data.type === "venta" ? "Registró venta" : "Registró gasto",
    parsed.data.description || undefined
  );
  revalidatePath("/dashboard/ventas");
}

export async function updateMovement(
  movementId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const parsed = movementSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    description: formData.get("description") ?? "",
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("movements")
    .update({
      type: parsed.data.type,
      amount: parsed.data.amount,
      description: parsed.data.description || null,
      occurred_at: parsed.data.occurredAt,
    })
    .eq("id", movementId);
  if (error) return { error: "No se pudo actualizar el movimiento" };

  await logActivity(profile, "Editó movimiento", parsed.data.description || undefined);
  revalidatePath("/dashboard/ventas");
}

export async function deleteMovement(movementId: string) {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const supabase = await createClient();
  const { error } = await supabase.from("movements").delete().eq("id", movementId);
  if (error) return { error: "No se pudo eliminar el movimiento" };

  await logActivity(profile, "Eliminó movimiento");
  revalidatePath("/dashboard/ventas");
}
