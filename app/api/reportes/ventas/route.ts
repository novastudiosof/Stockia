import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { isDay } from "@/lib/dates";
import { isModuleEnabled, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';
type FeedRow = Database["public"]["Functions"]["ventas_gastos_feed"]["Returns"][number];
const FEED_PAGE = 101;
const MAX_PAGES = 100; // tope de seguridad: ~10.000 filas

export async function GET(request: Request) {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }
  if (!(await isModuleEnabled(profile.organization_id, MODULE_KEYS.INFORMES))) {
    return new Response("Módulo no habilitado", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";
  const from = isDay(fromParam) ? fromParam : null;
  const to = isDay(toParam) ? toParam : null;

  // Mismo origen de datos que la pantalla "Ventas y Gastos" y la vista
  // previa: movimientos manuales más las ventas del carrito (una fila por día).
  const supabase = await createClient();
  const rows: {
    day: string;
    kind: string;
    concept: string | null;
    description: string | null;
    amount: number;
    sales_count: number | null;
  }[] = [];

  let afterDay: string | null = null;
  let afterKey: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await supabase.rpc("ventas_gastos_feed", {
      p_from: from,
      p_to: to,
      p_after_day: afterDay,
      p_after_key: afterKey,
      p_limit: FEED_PAGE,
    });
    const { data, error }: { data: FeedRow[] | null; error: unknown } = result;
    if (error) {
      console.error("[reporte ventas]", error);
      return new Response("No se pudo generar el reporte", { status: 500 });
    }
    const batch: FeedRow[] = data ?? [];
    rows.push(...batch.map((r) => ({ ...r, amount: Number(r.amount) })));
    if (batch.length < FEED_PAGE) break;
    const last: FeedRow = batch[batch.length - 1];
    afterDay = last.day;
    afterKey = last.key;
  }
  rows.sort((a, b) => (a.day === b.day ? 0 : a.day < b.day ? -1 : 1));

  const totalVentas = rows
    .filter((r) => r.kind !== "gasto")
    .reduce((sum, r) => sum + r.amount, 0);
  const totalGastos = rows
    .filter((r) => r.kind === "gasto")
    .reduce((sum, r) => sum + r.amount, 0);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Ventas y Gastos");

  sheet.columns = [
    { header: "Fecha", key: "fecha", width: 14 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Concepto", key: "concepto", width: 26 },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Monto", key: "monto", width: 16 },
  ];

  for (const r of rows) {
    sheet.addRow({
      fecha: r.day,
      tipo: r.kind === "gasto" ? "Gasto" : "Venta",
      concepto: r.concept || "",
      descripcion:
        r.kind === "venta_productos"
          ? `${r.sales_count ?? 0} venta${r.sales_count === 1 ? "" : "s"} del día`
          : r.description || "",
      monto: r.amount,
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
