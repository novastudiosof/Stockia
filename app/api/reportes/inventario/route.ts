import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category, Product } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';
const LOW_STOCK_THRESHOLD = 10;

export async function GET() {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }

  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("organization_id", profile.organization_id),
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
  ]);

  const categoryById = new Map(
    ((categories as Category[]) ?? []).map((c) => [c.id, c.name])
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventario");

  sheet.columns = [
    { header: "Categoría", key: "categoria", width: 24 },
    { header: "Producto", key: "producto", width: 30 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio compra", key: "compra", width: 16 },
    { header: "Precio venta", key: "venta", width: 16 },
    { header: "Stock bajo", key: "bajo", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const p of (products as Product[]) ?? []) {
    const row = sheet.addRow({
      categoria: categoryById.get(p.category_id) || "—",
      producto: p.name,
      cantidad: p.quantity,
      compra: Number(p.purchase_price),
      venta: Number(p.sale_price),
      bajo: p.quantity <= LOW_STOCK_THRESHOLD ? "Sí" : "No",
    });
    if (p.quantity <= LOW_STOCK_THRESHOLD) {
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
