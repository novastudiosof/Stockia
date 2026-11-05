"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { movementSchema } from "@/lib/validations/ventas";
import { ALLOWED_INVOICE_MIME_TYPES, MAX_INVOICE_FILE_SIZE_MB } from "@/lib/validations/facturas";

const BUCKET = process.env.SUPABASE_INVOICES_BUCKET || "invoices";

type ActionResult = { error?: string } | void;

function validateFile(file: File | null): string | null {
  if (!file || file.size === 0) return null;
  if (!ALLOWED_INVOICE_MIME_TYPES.includes(file.type)) {
    return "El archivo debe ser una imagen (JPG, PNG, WEBP) o un PDF";
  }
  if (file.size > MAX_INVOICE_FILE_SIZE_MB * 1024 * 1024) {
    return `El archivo no puede superar ${MAX_INVOICE_FILE_SIZE_MB}MB`;
  }
  return null;
}

/** Un día con cierre de caja ya no admite cambios en sus movimientos. */
async function assertDayOpen(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  day: string
): Promise<string | null> {
  const { data } = await supabase
    .from("cash_days")
    .select("closed_at")
    .eq("organization_id", organizationId)
    .eq("day", day)
    .maybeSingle();
  return data?.closed_at
    ? `El día ${day} ya tiene cierre de caja; reábrelo para modificar sus movimientos`
    : null;
}

export async function createMovement(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede registrar movimientos" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const parsed = movementSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    concept: formData.get("concept") ?? "",
    description: formData.get("description") ?? "",
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const file = formData.get("file") as File | null;
  const fileError = validateFile(file);
  if (fileError) return { error: fileError };

  const supabase = await createClient();
  const closedError = await assertDayOpen(supabase, profile.organization_id, parsed.data.occurredAt);
  if (closedError) return { error: closedError };
  let filePath: string | null = null;

  if (file && file.size > 0) {
    filePath = `${profile.organization_id}/movimientos/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type });
    if (uploadError) return { error: friendlyDbError(uploadError, "createMovement:upload", "No se pudo subir el archivo") };
  }

  const { error } = await supabase.from("movements").insert({
    organization_id: profile.organization_id,
    type: parsed.data.type,
    amount: parsed.data.amount,
    concept: parsed.data.concept || null,
    description: parsed.data.description || null,
    occurred_at: parsed.data.occurredAt,
    file_path: filePath,
    created_by: profile.id,
  });
  if (error) return { error: friendlyDbError(error, "createMovement", "No se pudo registrar el movimiento") };

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
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar movimientos" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const parsed = movementSchema.safeParse({
    type: formData.get("type"),
    amount: formData.get("amount"),
    concept: formData.get("concept") ?? "",
    description: formData.get("description") ?? "",
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("movements")
    .select("occurred_at")
    .eq("id", movementId)
    .single();
  for (const day of [current?.occurred_at, parsed.data.occurredAt]) {
    if (!day) continue;
    const closedError = await assertDayOpen(supabase, profile.organization_id, day);
    if (closedError) return { error: closedError };
  }
  const { error } = await supabase
    .from("movements")
    .update({
      type: parsed.data.type,
      amount: parsed.data.amount,
      concept: parsed.data.concept || null,
      description: parsed.data.description || null,
      occurred_at: parsed.data.occurredAt,
    })
    .eq("id", movementId);
  if (error) return { error: friendlyDbError(error, "updateMovement", "No se pudo actualizar el movimiento") };

  await logActivity(profile, "Editó movimiento", parsed.data.description || undefined);
  revalidatePath("/dashboard/ventas");
}

export async function deleteMovement(movementId: string) {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede eliminar movimientos" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("movements")
    .select("occurred_at")
    .eq("id", movementId)
    .single();
  if (current?.occurred_at) {
    const closedError = await assertDayOpen(supabase, profile.organization_id, current.occurred_at);
    if (closedError) return { error: closedError };
  }
  const { error } = await supabase.from("movements").delete().eq("id", movementId);
  if (error) return { error: friendlyDbError(error, "deleteMovement", "No se pudo eliminar el movimiento") };

  await logActivity(profile, "Eliminó movimiento");
  revalidatePath("/dashboard/ventas");
}

export async function getMovementFileUrl(filePath: string) {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
