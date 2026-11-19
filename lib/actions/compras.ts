"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { parseTaxOption } from "@/lib/tax";
import { purchaseProductSchema, purchaseSchema, supplierPaymentSchema, supplierSchema } from "@/lib/validations/compras";
import { ALLOWED_INVOICE_MIME_TYPES, MAX_INVOICE_FILE_SIZE_MB } from "@/lib/validations/facturas";

const BUCKET = process.env.SUPABASE_INVOICES_BUCKET || "invoices";

type ActionResult = { error?: string; success?: string; id?: string };

const MIGRATION_027 = {
  PGRST202: "Falta ejecutar la migración 027 en Supabase",
  PGRST204: "Falta ejecutar la migración 027 en Supabase",
  "42703": "Falta ejecutar la migración 027 en Supabase",
};

const MIGRATION_026 = {
  PGRST202: "Falta ejecutar la migración 026 en Supabase",
  PGRST205: "Falta ejecutar la migración 026 en Supabase",
  "42P01": "Falta ejecutar la migración 026 en Supabase",
  "42703": "Falta ejecutar la migración 026 en Supabase",
};

/** Compras y proveedores: solo el administrador, con el módulo activo. */
async function requireCompras() {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" as const };
  if (profile.role !== "owner") {
    return { error: "Solo el administrador puede manejar compras y proveedores" as const };
  }
  await requireModule(profile.organization_id, MODULE_KEYS.COMPRAS);
  return { profile, organizationId: profile.organization_id };
}

function revalidateCompras() {
  revalidatePath("/dashboard/compras", "layout");
  revalidatePath("/dashboard/proveedores");
  revalidatePath("/dashboard/catalogo", "layout");
  revalidatePath("/dashboard/ventas-productos");
  revalidatePath("/dashboard/ventas/cierre");
}

function supplierFromForm(formData: FormData) {
  return supplierSchema.safeParse({
    nombre: formData.get("nombre"),
    nit: formData.get("nit") ?? "",
    telefono: formData.get("telefono") ?? "",
    email: formData.get("email") ?? "",
    direccion: formData.get("direccion") ?? "",
    notas: formData.get("notas") ?? "",
  });
}

export async function createSupplier(
  _prev: ActionResult | void,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };
  const parsed = supplierFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: auth.organizationId,
      nombre: parsed.data.nombre,
      nit: parsed.data.nit || null,
      telefono: parsed.data.telefono || null,
      email: parsed.data.email || null,
      direccion: parsed.data.direccion || null,
      notas: parsed.data.notas || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error, "createSupplier", "No se pudo crear el proveedor", MIGRATION_026) };

  await logActivity(auth.profile, "Creó proveedor", parsed.data.nombre);
  revalidateCompras();
  return { success: "Proveedor creado", id: data.id };
}

export async function updateSupplier(
  supplierId: string,
  _prev: ActionResult | void,
  formData: FormData
): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };
  const parsed = supplierFromForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      nombre: parsed.data.nombre,
      nit: parsed.data.nit || null,
      telefono: parsed.data.telefono || null,
      email: parsed.data.email || null,
      direccion: parsed.data.direccion || null,
      notas: parsed.data.notas || null,
    })
    .eq("id", supplierId)
    .eq("organization_id", auth.organizationId);
  if (error) return { error: friendlyDbError(error, "updateSupplier", "No se pudo actualizar el proveedor", MIGRATION_026) };

  await logActivity(auth.profile, "Editó proveedor", parsed.data.nombre);
  revalidateCompras();
  return { success: "Proveedor actualizado" };
}

export async function deleteSupplier(supplierId: string, nombre: string): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", supplierId)
    .eq("organization_id", auth.organizationId);
  if (error) return { error: friendlyDbError(error, "deleteSupplier", "No se pudo eliminar el proveedor", MIGRATION_026) };

  await logActivity(auth.profile, "Eliminó proveedor", nombre);
  revalidateCompras();
  return { success: "Proveedor eliminado" };
}

export interface PurchaseInput {
  supplierId?: string;
  invoiceNumber?: string;
  purchaseDate: string;
  items: { productId: string; quantity: number | string; unitCost: number | string; salePrice?: number | string }[];
  payment: { type: "contado"; source: "caja" | "externo" } | { type: "credito"; days: number | string };
  notes?: string;
}

export async function createPurchase(input: PurchaseInput): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const parsed = purchaseSchema.safeParse({
    ...input,
    supplierId: input.supplierId || undefined,
    items: input.items.map((i) => ({
      ...i,
      salePrice: i.salePrice === "" || i.salePrice == null ? undefined : i.salePrice,
    })),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_purchase", {
      p_supplier_id: parsed.data.supplierId ?? null,
      p_invoice_number: parsed.data.invoiceNumber || null,
      p_purchase_date: parsed.data.purchaseDate,
      p_items: parsed.data.items,
      p_payment: parsed.data.payment,
      p_notes: parsed.data.notes || null,
    })
    .single<{ purchase_id: string; purchase_number: number; total: number }>();
  if (error) return { error: friendlyDbError(error, "createPurchase", "No se pudo registrar la compra", MIGRATION_026) };

  await logActivity(auth.profile, "Registró compra", `#${data.purchase_number} · ${data.total}`);
  revalidateCompras();
  return { success: `Compra #${data.purchase_number} registrada`, id: data.purchase_id };
}

export async function voidPurchase(purchaseId: string, reason?: string): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const cleanReason = (reason ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_purchase", {
    p_purchase_id: purchaseId,
    p_reason: cleanReason || null,
  });
  if (error) return { error: friendlyDbError(error, "voidPurchase", "No se pudo anular la compra", MIGRATION_026) };

  await logActivity(auth.profile, "Anuló compra", cleanReason ? `${purchaseId} · ${cleanReason}` : purchaseId);
  revalidateCompras();
  return { success: "Compra anulada" };
}

export async function registerSupplierPayment(input: {
  purchaseId: string;
  amount: string | number;
  source: string;
  notes?: string;
}): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const parsed = supplierPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_supplier_payment", {
    p_purchase_id: parsed.data.purchaseId,
    p_amount: parsed.data.amount,
    p_source: parsed.data.source,
    p_notes: parsed.data.notes || null,
  });
  if (error) {
    return { error: friendlyDbError(error, "registerSupplierPayment", "No se pudo registrar el pago", MIGRATION_026) };
  }

  await logActivity(auth.profile, "Pagó a proveedor", `${parsed.data.purchaseId} · ${parsed.data.amount}`);
  revalidateCompras();
  return { success: "Pago registrado" };
}

export async function voidSupplierPayment(paymentId: string): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_supplier_payment", { p_payment_id: paymentId });
  if (error) {
    return { error: friendlyDbError(error, "voidSupplierPayment", "No se pudo anular el pago", MIGRATION_026) };
  }

  await logActivity(auth.profile, "Anuló pago a proveedor", paymentId);
  revalidateCompras();
  return { success: "Pago anulado" };
}

export type CreatedPurchaseProduct = {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number;
  sale_price: number;
};

/**
 * Producto nuevo creado desde una compra: queda en el Catálogo con stock 0 y
 * el costo digitado; el stock entra cuando se registra la compra.
 */
export async function createProductForPurchase(input: {
  categoryId: string;
  name: string;
  barcode?: string;
  unitCost: string | number;
  salePrice: string | number;
  tax?: string;
}): Promise<{ error?: string; product?: CreatedPurchaseProduct }> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const parsed = purchaseProductSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const tax = parsed.data.tax ? parseTaxOption(parsed.data.tax) : null;
  if (parsed.data.tax && !tax) return { error: "Impuesto inválido" };

  const supabase = await createClient();
  const { data: product, error } = await supabase
    .rpc("create_product", {
      p_organization_id: auth.organizationId,
      p_category_id: parsed.data.categoryId,
      p_name: parsed.data.name,
      p_quantity: 0,
      p_description: "",
      p_purchase_price: parsed.data.unitCost,
      p_sale_price: parsed.data.salePrice,
      p_barcode: parsed.data.barcode || "",
    })
    .single<{ id: string; name: string; barcode: string | null }>();
  if (error || !product) {
    return {
      error: friendlyDbError(error, "createProductForPurchase", "No se pudo crear el producto", {
        "23505": "Ya existe un producto con ese código de barras",
      }),
    };
  }

  if (tax && (tax.kind !== "excluido" || tax.rate !== 0)) {
    await supabase.from("products").update({ tax_kind: tax.kind, tax_rate: tax.rate }).eq("id", product.id);
  }

  await logActivity(auth.profile, "Creó producto", `${parsed.data.name} (desde una compra)`);
  revalidatePath("/dashboard/catalogo", "layout");
  return {
    product: {
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      quantity: 0,
      purchase_price: parsed.data.unitCost,
      sale_price: parsed.data.salePrice,
    },
  };
}

/** Sube (o reemplaza) la foto/PDF de la factura del proveedor de una compra. */
export async function attachPurchaseFile(purchaseId: string, formData: FormData): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Elige una foto o un PDF" };
  if (!ALLOWED_INVOICE_MIME_TYPES.includes(file.type)) {
    return { error: "El archivo debe ser una imagen (JPG, PNG, WEBP) o un PDF" };
  }
  if (file.size > MAX_INVOICE_FILE_SIZE_MB * 1024 * 1024) {
    return { error: `El archivo no puede superar ${MAX_INVOICE_FILE_SIZE_MB}MB` };
  }

  const supabase = await createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "soporte";
  const filePath = `${auth.organizationId}/compras/${purchaseId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType: file.type });
  if (uploadError) {
    return { error: friendlyDbError(uploadError, "attachPurchaseFile:upload", "No se pudo subir el archivo") };
  }

  const { data: oldPath, error } = await supabase.rpc("set_purchase_file", {
    p_purchase_id: purchaseId,
    p_file_path: filePath,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    return { error: friendlyDbError(error, "attachPurchaseFile", "No se pudo guardar el soporte", MIGRATION_027) };
  }
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath as string]);

  await logActivity(auth.profile, "Adjuntó soporte de compra", purchaseId);
  revalidatePath(`/dashboard/compras/${purchaseId}`);
  return { success: "Soporte guardado" };
}

export async function removePurchaseFile(purchaseId: string): Promise<ActionResult> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { data: oldPath, error } = await supabase.rpc("set_purchase_file", {
    p_purchase_id: purchaseId,
    p_file_path: null,
  });
  if (error) return { error: friendlyDbError(error, "removePurchaseFile", "No se pudo quitar el soporte", MIGRATION_027) };
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath as string]);

  await logActivity(auth.profile, "Quitó soporte de compra", purchaseId);
  revalidatePath(`/dashboard/compras/${purchaseId}`);
  return { success: "Soporte eliminado" };
}

/** Enlace temporal (5 minutos) para ver o descargar el soporte. */
export async function getPurchaseFileUrl(purchaseId: string): Promise<{ error?: string; url?: string }> {
  const auth = await requireCompras();
  if ("error" in auth) return { error: auth.error };

  const supabase = await createClient();
  const { data: purchase } = await supabase
    .from("purchases")
    .select("file_path")
    .eq("id", purchaseId)
    .eq("organization_id", auth.organizationId)
    .maybeSingle();
  const path = (purchase as { file_path: string | null } | null)?.file_path;
  if (!path) return { error: "La compra no tiene soporte" };

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 5);
  if (error || !data) return { error: "No se pudo abrir el soporte" };
  return { url: data.signedUrl };
}
