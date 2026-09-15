"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { sanitizeOrFilterTerm } from "@/lib/postgrest-filter";
import { saleInputSchema } from "@/lib/validations/ventas-productos";
import type { Sale } from "@/lib/supabase/types";

type ActionResult = {
  error?: string;
  saleId?: string;
  total?: number;
  saleNumber?: number;
};

export interface NewCustomerInput {
  nombre: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
}

export async function createSale(
  items: { productId: string; quantity: number }[],
  customer?: { id?: string; data?: NewCustomerInput }
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const parsed = saleInputSchema.safeParse({
    items,
    customerId: customer?.id,
    customerData: customer?.data,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_sale", {
      p_organization_id: profile.organization_id,
      p_items: parsed.data.items,
      p_customer_id: parsed.data.customerId ?? null,
      p_customer_data: parsed.data.customerData ?? null,
    })
    .single<{ sale_id: string; total: number; sale_number: number }>();

  if (error) return { error: friendlyDbError(error, "createSale", "No se pudo registrar la venta") };

  await logActivity(profile, "Registró venta de productos", `Total: ${data.total}`);
  revalidatePath("/dashboard/ventas-productos");
  revalidatePath("/dashboard/catalogo");

  return { saleId: data.sale_id, total: data.total, saleNumber: data.sale_number };
}

export async function voidSale(saleId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede anular una venta" };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", { p_sale_id: saleId });
  if (error) return { error: friendlyDbError(error, "voidSale", "No se pudo anular la venta") };

  await logActivity(profile, "Anuló venta de productos", saleId);
  revalidatePath("/dashboard/ventas-productos");
  revalidatePath("/dashboard/catalogo");
  return {};
}

export interface SaleSearchFilters {
  query?: string;
  from?: string;
  to?: string;
}

export interface SaleSearchResult {
  results: Sale[];
  error?: string;
}

/**
 * Buscador de ventas recientes: por nombre/documento de cliente o número de
 * factura, con rango de fechas opcional. Usado desde el historial de
 * "Ventas por Productos" para encontrar y reimprimir una venta antigua sin
 * depender de que esté entre las últimas 20.
 */
export async function searchSales(filters: SaleSearchFilters): Promise<SaleSearchResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { results: [] };
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const trimmed = filters.query ? sanitizeOrFilterTerm(filters.query.trim()) : "";
  if (trimmed) {
    const asSaleNumber = Number(trimmed);
    const orClauses = [
      `customer_snapshot->>nombre.ilike.%${trimmed}%`,
      `customer_snapshot->>documento.ilike.%${trimmed}%`,
    ];
    if (Number.isInteger(asSaleNumber) && asSaleNumber > 0) {
      orClauses.push(`sale_number.eq.${asSaleNumber}`);
    }
    query = query.or(orClauses.join(","));
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59`);

  const { data, error } = await query;
  if (error) {
    return { results: [], error: friendlyDbError(error, "searchSales", "No se pudo buscar") };
  }
  return { results: data ?? [] };
}
