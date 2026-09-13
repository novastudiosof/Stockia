import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Movement } from "@/lib/supabase/types";

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
    .from("movements")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("occurred_at", { ascending: true });

  if (from) query = query.gte("occurred_at", from);
  if (to) query = query.lte("occurred_at", to);

  const { data } = await query;
  const movements = (data as Movement[]) ?? [];

  const totalVentas = movements
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const totalGastos = movements
    .filter((m) => m.type === "gasto")
    .reduce((sum, m) => sum + Number(m.amount), 0);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ventas y Gastos");

  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Monto", key: "monto", width: 16 },
  ];

  for (const m of movements) {
    sheet.addRow({
      fecha: m.occurred_at,
      tipo: m.type === "venta" ? "Venta" : "Gasto",
      descripcion: m.description || "",
      monto: Number(m.amount),
    });
  }
  sheet.getColumn("monto").numFmt = currencyFormat;

  sheet.addRow({});
  const totalVentasRow = sheet.addRow({ descripcion: "Total ventas", monto: totalVentas });
  const totalGastosRow = sheet.addRow({ descripcion: "Total gastos", monto: totalGastos });
  const balanceRow = sheet.addRow({ descripcion: "Balance", monto: totalVentas - totalGastos });
  [totalVentasRow, totalGastosRow, balanceRow].forEach((row) => {
    row.font = { bold: true };
    row.getCell("monto").numFmt = currencyFormat;
  });
  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `ventas-gastos${from ? `_${from}` : ""}${to ? `_a_${to}` : ""}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
