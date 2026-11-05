"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";

type ActionResult = { error?: string } | void;

const conceptSchema = z.object({
  type: z.enum(["venta", "gasto"]),
  name: z.string().trim().min(1, "Escribe el nombre del concepto").max(60),
});

export async function createConcept(
  type: "venta" | "gasto",
  name: string
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar los conceptos" };

  const parsed = conceptSchema.safeParse({ type, name });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("movement_concepts").insert({
    organization_id: profile.organization_id,
    type: parsed.data.type,
    name: parsed.data.name,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ese concepto ya existe" };
    return { error: friendlyDbError(error, "createConcept", "No se pudo agregar el concepto") };
  }

  await logActivity(profile, "Agregó concepto", parsed.data.name);
  revalidatePath("/dashboard/cuenta");
  revalidatePath("/dashboard/ventas");
}

export async function deleteConcept(conceptId: string, name: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar los conceptos" };

  const supabase = await createClient();
  const { error } = await supabase.from("movement_concepts").delete().eq("id", conceptId);
  if (error) return { error: friendlyDbError(error, "deleteConcept", "No se pudo eliminar el concepto") };

  await logActivity(profile, "Eliminó concepto", name);
  revalidatePath("/dashboard/cuenta");
  revalidatePath("/dashboard/ventas");
}
