"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/db-errors";
import {
  createOrganizationSchema,
  invoiceSettingsSchema,
  ALLOWED_LOGO_MIME_TYPES,
  MAX_LOGO_FILE_SIZE_MB,
} from "@/lib/validations/superadmin";

type ActionResult = { error?: string } | void;

export async function createOrganization(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const admin_profile = await requireRole("super_admin");

  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    ownerFullName: formData.get("ownerFullName"),
    ownerUsername: formData.get("ownerUsername"),
    ownerPassword: formData.get("ownerPassword"),
    maxAuxiliares: formData.get("maxAuxiliares") || 1,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      max_auxiliares: parsed.data.maxAuxiliares,
    })
    .select()
    .single();

  if (orgError || !org) {
    return {
      error: friendlyDbError(
        orgError,
        "createOrganization:org",
        "No se pudo crear la organización (verifica que el slug sea único)"
      ),
    };
  }

  const authEmail = `${crypto.randomUUID()}@inventario.internal`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password: parsed.data.ownerPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    await admin.from("organizations").delete().eq("id", org.id);
    return {
      error: friendlyDbError(createError, "createOrganization:authUser", "No se pudo crear el usuario del administrador"),
    };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    organization_id: org.id,
    username: parsed.data.ownerUsername,
    full_name: parsed.data.ownerFullName,
    auth_email: authEmail,
    role: "owner",
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    await admin.from("organizations").delete().eq("id", org.id);
    return { error: "Ese nombre de usuario ya está en uso" };
  }

  const { data: modules } = await admin.from("modules").select("id");
  if (modules && modules.length > 0) {
    await admin.from("organization_modules").insert(
      modules.map((m) => ({ organization_id: org.id, module_id: m.id, enabled: false }))
    );
  }

  await logActivity(admin_profile, "Creó organización", parsed.data.name);
  revalidatePath("/superadmin");
  redirect(`/superadmin/organizaciones/${org.id}`);
}

export async function toggleModule(
  organizationId: string,
  moduleId: string,
  enabled: boolean
) {
  const profile = await requireRole("super_admin");
  const supabase = await createClient();

  const { error } = await supabase.from("organization_modules").upsert({
    organization_id: organizationId,
    module_id: moduleId,
    enabled,
    enabled_at: enabled ? new Date().toISOString() : null,
  });
  if (error) return { error: friendlyDbError(error, "toggleModule", "No se pudo actualizar el módulo") };

  await logActivity(profile, enabled ? "Activó módulo" : "Desactivó módulo", moduleId);
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
  revalidatePath("/dashboard/modulos");
}

export async function updateMaxAuxiliares(organizationId: string, maxAuxiliares: number) {
  const profile = await requireRole("super_admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({ max_auxiliares: maxAuxiliares })
    .eq("id", organizationId);
  if (error) return { error: friendlyDbError(error, "updateMaxAuxiliares", "No se pudo actualizar el límite de auxiliares") };

  await logActivity(profile, "Actualizó límite de auxiliares", String(maxAuxiliares));
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
}

export async function updateOrganizationLimits(
  organizationId: string,
  maxCategorias: number,
  maxProductosPorCategoria: number
) {
  const profile = await requireRole("super_admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      max_categorias: maxCategorias,
      max_productos_por_categoria: maxProductosPorCategoria,
    })
    .eq("id", organizationId);
  if (error) return { error: friendlyDbError(error, "updateOrganizationLimits", "No se pudo actualizar los límites de catálogo") };

  await logActivity(
    profile,
    "Actualizó límites de catálogo",
    `${maxCategorias} categorías, ${maxProductosPorCategoria} productos c/u`
  );
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
}

export async function updateInvoiceSettings(
  organizationId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireRole("super_admin");

  const parsed = invoiceSettingsSchema.safeParse({
    legalName: formData.get("legalName") ?? "",
    taxId: formData.get("taxId") ?? "",
    billingAddress: formData.get("billingAddress") ?? "",
    billingPhone: formData.get("billingPhone") ?? "",
    billingEmail: formData.get("billingEmail") ?? "",
    invoiceFooter: formData.get("invoiceFooter") ?? "",
    currency: formData.get("currency") || "COP",
    invoicePrefix: formData.get("invoicePrefix") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

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
    const { error: uploadError } = await supabase.storage
      .from("branding")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) return { error: friendlyDbError(uploadError, "updateInvoiceSettings:upload", "No se pudo subir el logo") };
    logoUrl = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase
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
      ...(logoUrl ? { logo_url: logoUrl } : {}),
    })
    .eq("id", organizationId);
  if (error) return { error: friendlyDbError(error, "updateInvoiceSettings", "No se pudo actualizar la información de facturación") };

  await logActivity(profile, "Actualizó datos de facturación", organizationId);
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
}

export async function toggleOrganizationActive(organizationId: string, isActive: boolean) {
  const profile = await requireRole("super_admin");
  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({ is_active: isActive })
    .eq("id", organizationId);
  if (error) return { error: friendlyDbError(error, "toggleOrganizationActive", "No se pudo actualizar el estado de la organización") };

  await logActivity(profile, isActive ? "Reactivó organización" : "Suspendió organización");
  revalidatePath(`/superadmin/organizaciones/${organizationId}`);
  revalidatePath("/superadmin");
}
