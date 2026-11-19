import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { isModuleEnabled, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { getStockSettings } from "@/lib/org-stock";
import { effectiveMinStock, stockStatus } from "@/lib/stock";
import type { Category, Product } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';

export async function GET() {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }
  if (!(await isModuleEnabled(profile.organization_id, MODULE_KEYS.INFORMES))) {
    return new Response("Módulo no habilitado", { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: categories }, { data: products }, stockSettings] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("organization_id", profile.organization_id),
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    getStockSettings(profile.organization_id),
  ]);

  const categoryById = new Map(
    ((categories as Category[]) ?? []).map((c) => [c.id, c.name])
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  sheet.columns = [
    { header: "Categoría", key: "categoria", width: 24 },
    { header: "Producto", key: "producto", width: 30 },
    { header: "Código de barras", key: "codigoBarras", width: 20 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Stock mínimo", key: "minimo", width: 14 },
    { header: "Precio compra", key: "compra", width: 16 },
    { header: "Precio venta", key: "venta", width: 16 },
    { header: "Stock bajo", key: "bajo", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const p of (products as Product[]) ?? []) {
    const status = stockStatus(p.quantity, p.min_stock, stockSettings);
    const row = sheet.addRow({
      categoria: categoryById.get(p.category_id) || "—",
      producto: p.name,
      codigoBarras: p.barcode || "",
      cantidad: p.quantity,
      minimo: effectiveMinStock(p.min_stock, stockSettings),
      compra: Number(p.purchase_price),
      venta: Number(p.sale_price),
      bajo: status === "agotado" ? "Agotado" : status === "bajo" ? "Sí" : "No",
    });
    if (status !== "ok") {
      row.getCell("bajo").font = { color: { argb: "FFB91C1C" }, bold: true };
    }
  }
  sheet.getColumn("compra").numFmt = currencyFormat;
  sheet.getColumn("venta").numFmt = currencyFormat;

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="inventario.xlsx"',
    },
  });
}
