"use server";

import { revalidatePath } from "next/cache";

import { requireProfile, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/db-errors";
import {
  ALLOWED_LOGO_MIME_TYPES,
  MAX_LOGO_FILE_SIZE_MB,
  changePasswordSchema,
  createAuxiliarSchema,
  invoiceSettingsSchema,
  themeColorSchema,
} from "@/lib/validations/cuenta";

type ActionResult = { error?: string; success?: string } | void;

export async function changePassword(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = changePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "No se pudo actualizar la contraseña" };

  await logActivity(profile, "Cambió su contraseña");
  return { success: "Contraseña actualizada correctamente" };
}

export async function createAuxiliar(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const parsed = createAuxiliarSchema.safeParse({
    username: formData.get("username"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

  const [{ data: org }, { count }] = await Promise.all([
    supabase
      .from("organizations")
      .select("max_auxiliares")
      .eq("id", profile.organization_id)
      .single(),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id)
      .eq("role", "auxiliar"),
  ]);

  if (!org) return { error: "No se pudo verificar el límite de usuarios" };
  if ((count ?? 0) >= org.max_auxiliares) {
    return {
      error: `Ya alcanzaste el límite de ${org.max_auxiliares} auxiliar(es) para tu plan. Contáctanos para ampliarlo.`,
    };
  }

  const admin = createAdminClient();
  const authEmail = `${crypto.randomUUID()}@inventario.internal`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: parsed.data.password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return { error: "No se pudo crear el usuario (el nombre de usuario ya existe)" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    organization_id: profile.organization_id,
    username: parsed.data.username,
    full_name: parsed.data.fullName,
    auth_email: authEmail,
    role: "auxiliar",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "Ese nombre de usuario ya está en uso" };
  }

  await logActivity(profile, "Creó usuario auxiliar", parsed.data.username);
  revalidatePath("/dashboard/cuenta");
  return { success: "Auxiliar creado correctamente" };
}

export async function deleteAuxiliar(auxiliarId: string, username: string) {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, organization_id, role")
    .eq("id", auxiliarId)
    .single();

  if (
    !target ||
    target.organization_id !== profile.organization_id ||
    target.role !== "auxiliar"
  ) {
    return { error: "No se pudo eliminar ese usuario" };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(auxiliarId);
  if (error) return { error: "No se pudo eliminar el usuario" };

  await logActivity(profile, "Eliminó usuario auxiliar", username);
  revalidatePath("/dashboard/cuenta");
}

/**
 * Datos de facturación y color de la página: los edita el administrador de
 * cada negocio. La política RLS de organizations solo deja escribir al super
 * admin, así que se usa la service role; la autorización se valida aquí
 * (rol owner) y el id de la organización sale siempre del perfil, nunca del
 * formulario.
 */
export async function updateMyInvoiceSettings(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireRole("owner");
  const organizationId = profile.organization_id;
  if (!organizationId) return { error: "Sin organización asociada" };

  const parsed = invoiceSettingsSchema.safeParse({
    legalName: formData.get("legalName") ?? "",
    taxId: formData.get("taxId") ?? "",
    billingAddress: formData.get("billingAddress") ?? "",
    billingPhone: formData.get("billingPhone") ?? "",
    billingEmail: formData.get("billingEmail") ?? "",
    invoiceFooter: formData.get("invoiceFooter") ?? "",
    currency: formData.get("currency") || "COP",
    invoicePrefix: formData.get("invoicePrefix") ?? "",
    taxEnabled: formData.get("taxEnabled") === "on",
    pricesIncludeTax: formData.get("pricesIncludeTax") !== "excluded",
    taxDv: formData.get("taxDv") ?? "",
    taxRegime: formData.get("taxRegime") ?? "",
    billingCity: formData.get("billingCity") ?? "",
    taxResponsibilities: formData.get("taxResponsibilities") ?? "",
    resolutionNumber: formData.get("resolutionNumber") ?? "",
    resolutionFrom: formData.get("resolutionFrom") ?? "",
    resolutionTo: formData.get("resolutionTo") ?? "",
    resolutionValidUntil: formData.get("resolutionValidUntil") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { resolutionFrom, resolutionTo } = parsed.data;
  if (
    typeof resolutionFrom === "number" &&
    typeof resolutionTo === "number" &&
    resolutionTo < resolutionFrom
  ) {
    return { error: 'El rango de la resolución es inválido: el "hasta" es menor que el "desde"' };
  }

  const admin = createAdminClient();

  const file = formData.get("logo") as File | null;
  let logoUrl: string | undefined;
  if (file && file.size > 0) {
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.type)) {
      return { error: "El logo debe ser una imagen (PNG, JPG o WEBP)" };
    }
    if (file.size > MAX_LOGO_FILE_SIZE_MB * 1024 * 1024) {
      return { error: `El logo no puede superar ${MAX_LOGO_FILE_SIZE_MB}MB` };
    }
    const path = `${organizationId}/logo-${crypto.randomUUID()}`;
    const { error: uploadError } = await admin.storage
      .from("branding")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) {
      return { error: friendlyDbError(uploadError, "updateMyInvoiceSettings:upload", "No se pudo subir el logo") };
    }
    logoUrl = admin.storage.from("branding").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await admin
    .from("organizations")
    .update({
      legal_name: parsed.data.legalName || null,
      tax_id: parsed.data.taxId || null,
      billing_address: parsed.data.billingAddress || null,
      billing_phone: parsed.data.billingPhone || null,
      billing_email: parsed.data.billingEmail || null,
      invoice_footer: parsed.data.invoiceFooter || null,
      currency: parsed.data.currency,
      invoice_prefix: parsed.data.invoicePrefix || "",
      tax_enabled: parsed.data.taxEnabled,
      prices_include_tax: parsed.data.pricesIncludeTax,
      tax_dv: parsed.data.taxDv || null,
      tax_regime: parsed.data.taxRegime || null,
      billing_city: parsed.data.billingCity || null,
      tax_responsibilities: parsed.data.taxResponsibilities || null,
      invoice_resolution_number: parsed.data.resolutionNumber || null,
      invoice_resolution_from: typeof resolutionFrom === "number" ? resolutionFrom : null,
      invoice_resolution_to: typeof resolutionTo === "number" ? resolutionTo : null,
      invoice_resolution_valid_until: parsed.data.resolutionValidUntil || null,
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    })
    .eq("id", organizationId);
  if (error) {
    return { error: friendlyDbError(error, "updateMyInvoiceSettings", "No se pudieron guardar los datos de facturación", {
      PGRST204: "Falta ejecutar la migración 023 en Supabase",
      "42703": "Falta ejecutar la migración 023 en Supabase",
    }) };
  }

  await logActivity(profile, "Actualizó datos de facturación", organizationId);
  revalidatePath("/dashboard/cuenta");
  revalidatePath("/dashboard", "layout");
  return { success: "Datos de facturación guardados" };
}

export async function updateMyThemeColor(themeColor: string | null): Promise<{ error?: string }> {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const parsed = themeColorSchema.safeParse(themeColor);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ theme_color: parsed.data })
    .eq("id", profile.organization_id);
  if (error) {
    return {
      error: friendlyDbError(error, "updateMyThemeColor", "No se pudo guardar el color", {
        PGRST204: "Falta ejecutar la migración 015 en Supabase",
        "42703": "Falta ejecutar la migración 015 en Supabase",
      }),
    };
  }

  await logActivity(profile, "Cambió el color de la página", parsed.data ?? "color por defecto");
  revalidatePath("/dashboard", "layout");
  return {};
}
