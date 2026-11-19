"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { abonoSchema } from "@/lib/validations/clientes";

type ActionResult = { error?: string; success?: string };

const MIGRATION_024 = {
  PGRST202: "Falta ejecutar la migración 024 en Supabase",
  "42703": "Falta ejecutar la migración 024 en Supabase",
  "42P01": "Falta ejecutar la migración 024 en Supabase",
};

function revalidateCartera() {
  revalidatePath("/dashboard/cartera", "layout");
  revalidatePath("/dashboard/clientes");
  revalidatePath("/dashboard/ventas/cierre");
}

export interface CustomerCredit {
  /** Lo que debe hoy. */
  debt: number;
  /** Cupo de fiado (null = sin cupo). */
  limit: number | null;
  error?: string;
}

/** Deuda y cupo de un cliente, para mostrarlos al fiar desde la venta. */
export async function getCustomerCredit(customerId: string): Promise<CustomerCredit> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { debt: 0, limit: null };
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const supabase = await createClient();
  const [{ data: cliente, error }, { data: sales }] = await Promise.all([
    supabase
      .from("clientes")
      .select("credit_limit")
      .eq("id", customerId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("sales")
      .select("credit_balance")
      .eq("organization_id", profile.organization_id)
      .eq("customer_id", customerId)
      .is("voided_at", null)
      .gt("credit_balance", 0),
  ]);
  if (error) {
    return {
      debt: 0,
      limit: null,
      error: friendlyDbError(error, "getCustomerCredit", "No se pudo consultar el cupo", MIGRATION_024),
    };
  }
  const debt = ((sales as { credit_balance: number }[] | null) ?? []).reduce(
    (sum, s) => sum + Number(s.credit_balance),
    0
  );
  const limit = cliente?.credit_limit;
  return { debt, limit: limit == null ? null : Number(limit) };
}

/** Registra un abono (cualquier usuario, con la caja de hoy abierta). */
export async function registerAbono(input: {
  customerId: string;
  amount: string | number;
  method: string;
  saleId?: string;
  notes?: string;
}): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const parsed = abonoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_customer_payment", {
    p_customer_id: parsed.data.customerId,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_sale_id: parsed.data.saleId ?? null,
    p_notes: parsed.data.notes || null,
  });
  if (error) {
    return { error: friendlyDbError(error, "registerAbono", "No se pudo registrar el abono", MIGRATION_024) };
  }

  await logActivity(
    profile,
    "Registró abono de fiado",
    `${parsed.data.customerId} · ${parsed.data.amount} · ${parsed.data.method}`
  );
  revalidateCartera();
  return { success: "Abono registrado" };
}

/** Anula un abono (solo el administrador, con la caja de ese día abierta). */
export async function voidAbono(paymentId: string, reason?: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede anular un abono" };
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const cleanReason = (reason ?? "").trim().slice(0, 200);
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_customer_payment", {
    p_payment_id: paymentId,
    p_reason: cleanReason || null,
  });
  if (error) {
    return { error: friendlyDbError(error, "voidAbono", "No se pudo anular el abono", MIGRATION_024) };
  }

  await logActivity(profile, "Anuló abono de fiado", cleanReason ? `${paymentId} · ${cleanReason}` : paymentId);
  revalidateCartera();
  return { success: "Abono anulado" };
}
