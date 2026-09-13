"use server";

import { revalidatePath } from "next/cache";

import { requireProfile, requireRole } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { changePasswordSchema, createAuxiliarSchema } from "@/lib/validations/cuenta";

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
