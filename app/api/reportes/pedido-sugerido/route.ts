import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayBogota } from "@/lib/dates";
import { suggestedOrder } from "@/lib/stock";
import type { LowStockRow } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';

/**
 * Pedido sugerido en Excel (solo administrador). La lista sale de la base de
 * datos; del formulario solo se toman las cantidades que se cambiaron en pantalla.
 */
export async function POST(request: Request) {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }

  let quantities: Record<string, unknown> = {};
  try {
    const form = await request.formData();
    const raw = form.get("cantidades");
    if (typeof raw === "string" && raw.length < 200_000) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) quantities = parsed;
    }
  } catch {
    quantities = {};
  }

  const supabase = await createClient();
  const [{ data, error }, { data: suppliers }] = await Promise.all([
    supabase.rpc("low_stock_products"),
    supabase.from("suppliers").select("id, nombre, telefono").eq("organization_id", profile.organization_id),
  ]);
  if (error) return new Response("No se pudo generar el pedido", { status: 500 });

  const supplierById = new Map(
    ((suppliers as { id: string; nombre: string; telefono: string | null }[] | null) ?? []).map((s) => [s.id, s])
  );

  const rows = ((data as LowStockRow[] | null) ?? []).map((r) => {
    const sent = Number(quantities[r.product_id]);
    const qty = Number.isFinite(sent) && sent >= 0 ? Math.min(Math.floor(sent), 10_000_000) : suggestedOrder(Number(r.quantity), Number(r.min_stock));
    const supplier = r.last_supplier_id ? supplierById.get(r.last_supplier_id) : undefined;
    return {
      proveedor: supplier?.nombre ?? r.last_supplier_name ?? "Sin proveedor",
      telefono: supplier?.telefono ?? "",
      producto: r.name,
      codigo: r.barcode ?? "",
      categoria: r.category_name,
      stock: Number(r.quantity),
      minimo: Number(r.min_stock),
      pedir: qty,
      costo: r.last_unit_cost == null ? "" : Number(r.last_unit_cost),
      estimado: r.last_unit_cost == null ? "" : qty * Number(r.last_unit_cost),
    };
  });
  rows.sort((a, b) =>
    a.proveedor === "Sin proveedor" && b.proveedor !== "Sin proveedor"
      ? 1
      : b.proveedor === "Sin proveedor" && a.proveedor !== "Sin proveedor"
        ? -1
        : a.proveedor.localeCompare(b.proveedor, "es") || a.producto.localeCompare(b.producto, "es")
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pedido sugerido");
  sheet.columns = [
    { header: "Proveedor", key: "proveedor", width: 28 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Producto", key: "producto", width: 32 },
    { header: "Código", key: "codigo", width: 16 },
    { header: "Categoría", key: "categoria", width: 18 },
    { header: "Stock", key: "stock", width: 9 },
    { header: "Mínimo", key: "minimo", width: 9 },
    { header: "Pedir", key: "pedir", width: 9 },
    { header: "Último costo", key: "costo", width: 14 },
    { header: "Estimado", key: "estimado", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows.filter((r) => r.pedir > 0)) sheet.addRow(row);
  for (const key of ["costo", "estimado"]) sheet.getColumn(key).numFmt = currencyFormat;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pedido-sugerido-${todayBogota()}.xlsx"`,
    },
  });
}
