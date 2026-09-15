import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Sale } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';

export async function GET(request: Request) {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true })
    .limit(10000);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data } = await query;
  const sales = (data as Sale[]) ?? [];

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ventas por Productos");

  sheet.columns = [
    { header: "N.º", key: "numero", width: 10 },
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Cliente", key: "cliente", width: 28 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Productos", key: "productos", width: 50 },
    { header: "Total", key: "total", width: 16 },
    { header: "Estado", key: "estado", width: 12 },
  ];
  sheet.getRow(1).font = { bold: true };

  let totalGeneral = 0;
  for (const sale of sales) {
    const productosResumen = sale.items
      .map((item) => `${item.quantity}x ${item.name}`)
      .join(", ");

    const row = sheet.addRow({
      numero: sale.sale_number ?? "",
      fecha: new Date(sale.created_at).toLocaleString("es-CO"),
      cliente: sale.customer_snapshot?.nombre || "Consumidor final",
      documento: sale.customer_snapshot?.documento || "",
      productos: productosResumen,
      total: Number(sale.total),
      estado: sale.voided_at ? "Anulada" : "Activa",
    });

    if (sale.voided_at) {
      row.font = { color: { argb: "FF6B7280" }, italic: true };
    } else {
      totalGeneral += Number(sale.total);
    }
  }
  sheet.getColumn("total").numFmt = currencyFormat;

  sheet.addRow({});
  const totalRow = sheet.addRow({ productos: "Total (ventas activas)", total: totalGeneral });
  totalRow.font = { bold: true };
  totalRow.getCell("total").numFmt = currencyFormat;

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `ventas-productos${from ? `_${from}` : ""}${to ? `_a_${to}` : ""}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
