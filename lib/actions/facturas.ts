"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import {
  ALLOWED_INVOICE_MIME_TYPES,
  MAX_INVOICE_FILE_SIZE_MB,
  invoiceSchema,
} from "@/lib/validations/facturas";

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

export async function createInvoice(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  const parsed = invoiceSchema.safeParse({
    provider: formData.get("provider"),
    invoiceNumber: formData.get("invoiceNumber"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const file = formData.get("file") as File | null;
  const fileError = validateFile(file);
  if (fileError) return { error: fileError };

  const supabase = await createClient();
  let filePath: string | null = null;

  if (file && file.size > 0) {
    filePath = `${profile.organization_id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type });
    if (uploadError) return { error: friendlyDbError(uploadError, "createInvoice:upload", "No se pudo subir el archivo") };
  }

  const { error } = await supabase.from("invoices").insert({
    organization_id: profile.organization_id,
    provider: parsed.data.provider,
    invoice_number: parsed.data.invoiceNumber,
    amount: parsed.data.amount,
    occurred_at: parsed.data.occurredAt,
    file_path: filePath,
    created_by: profile.id,
  });
  if (error) return { error: friendlyDbError(error, "createInvoice", "No se pudo registrar la factura") };

  await logActivity(profile, "Registró factura", parsed.data.provider);
  revalidatePath("/dashboard/facturas");
}

export async function updateInvoice(
  invoiceId: string,
  currentFilePath: string | null,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar facturas" };
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  const parsed = invoiceSchema.safeParse({
    provider: formData.get("provider"),
    invoiceNumber: formData.get("invoiceNumber"),
    amount: formData.get("amount"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const file = formData.get("file") as File | null;
  const fileError = validateFile(file);
  if (fileError) return { error: fileError };

  const supabase = await createClient();
  let filePath = currentFilePath;

  if (file && file.size > 0) {
    filePath = `${profile.organization_id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, file, { contentType: file.type });
    if (uploadError) return { error: friendlyDbError(uploadError, "updateInvoice:upload", "No se pudo subir el archivo") };

    if (currentFilePath) {
      await supabase.storage.from(BUCKET).remove([currentFilePath]);
    }
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      provider: parsed.data.provider,
      invoice_number: parsed.data.invoiceNumber,
      amount: parsed.data.amount,
      occurred_at: parsed.data.occurredAt,
      file_path: filePath,
    })
    .eq("id", invoiceId);
  if (error) return { error: friendlyDbError(error, "updateInvoice", "No se pudo actualizar la factura") };

  await logActivity(profile, "Editó factura", parsed.data.provider);
  revalidatePath("/dashboard/facturas");
}

export async function deleteInvoice(invoiceId: string, filePath: string | null, provider: string) {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede eliminar facturas" };
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  const supabase = await createClient();

  if (filePath) {
    await supabase.storage.from(BUCKET).remove([filePath]);
  }

  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: friendlyDbError(error, "deleteInvoice", "No se pudo eliminar la factura") };

  await logActivity(profile, "Eliminó factura", provider);
  revalidatePath("/dashboard/facturas");
}

export async function getInvoiceFileUrl(filePath: string) {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 5);

  if (error) return null;
  return data.signedUrl;
}
