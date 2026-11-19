import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { isModuleEnabled, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { todayBogota } from "@/lib/dates";
import type { CarteraRow } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';

/** Cartera (fiado) en Excel: lo que debe cada cliente, por antigüedad del vencimiento. */
export async function GET() {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }
  if (!(await isModuleEnabled(profile.organization_id, MODULE_KEYS.CLIENTES))) {
    return new Response("Módulo no habilitado", { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cartera_resumen");
  if (error) return new Response("No se pudo generar el informe", { status: 500 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cartera");
  sheet.columns = [
    { header: "Cliente", key: "cliente", width: 30 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Ventas", key: "ventas", width: 9 },
    { header: "Cupo", key: "cupo", width: 14 },
    { header: "Debe", key: "debe", width: 14 },
    { header: "Al día", key: "aldia", width: 14 },
    { header: "Vencido 1-30", key: "v30", width: 14 },
    { header: "Vencido 31-60", key: "v60", width: 14 },
    { header: "Vencido 61-90", key: "v90", width: 14 },
    { header: "Vencido +90", key: "vmas", width: 14 },
    { header: "Vencimiento más antiguo", key: "vence", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of (data as CarteraRow[] | null) ?? []) {
    sheet.addRow({
      cliente: r.nombre,
      documento: r.documento ?? "",
      telefono: r.telefono ?? "",
      ventas: r.sales_count,
      cupo: r.credit_limit == null ? "" : Number(r.credit_limit),
      debe: Number(r.debt),
      aldia: Number(r.current_amount),
      v30: Number(r.overdue_1_30),
      v60: Number(r.overdue_31_60),
      v90: Number(r.overdue_61_90),
      vmas: Number(r.overdue_90),
      vence: r.oldest_due ?? "",
    });
  }
  for (const key of ["cupo", "debe", "aldia", "v30", "v60", "v90", "vmas"]) {
    sheet.getColumn(key).numFmt = currencyFormat;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cartera-${todayBogota()}.xlsx"`,
    },
  });
}
