"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { saleInputSchema } from "@/lib/validations/ventas-productos";

type ActionResult = { error?: string; saleId?: string; total?: number };

export async function createSale(
  items: { productId: string; quantity: number }[]
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const parsed = saleInputSchema.safeParse({ items });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_sale", {
      p_organization_id: profile.organization_id,
      p_items: parsed.data.items,
    })
    .single<{ sale_id: string; total: number }>();

  if (error) return { error: error.message || "No se pudo registrar la venta" };

  await logActivity(profile, "Registró venta de productos", `Total: ${data.total}`);
  revalidatePath("/dashboard/ventas-productos");
  revalidatePath("/dashboard/catalogo");

  return { saleId: data.sale_id, total: data.total };
}
