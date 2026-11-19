import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { isModuleEnabled, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import type { Purchase } from "@/lib/supabase/types";

const currencyFormat = '"$"#,##0';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Compras en Excel: una fila por producto comprado, en el rango de fechas de la factura. */
export async function GET(request: Request) {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }
  if (!(await isModuleEnabled(profile.organization_id, MODULE_KEYS.COMPRAS))) {
    return new Response("Módulo no habilitado", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const from = params.get("desde") ?? "";
  const to = params.get("hasta") ?? "";
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return new Response("Rango de fechas inválido", { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .gte("purchase_date", from)
    .lte("purchase_date", to)
    .order("purchase_date", { ascending: true })
    .order("purchase_number", { ascending: true });
  if (error) return new Response("No se pudo generar el informe", { status: 500 });

  const workbook = new ExcelJS.Workbook();
  const detail = workbook.addWorksheet("Detalle");
  detail.columns = [
    { header: "Compra", key: "numero", width: 9 },
    { header: "Fecha factura", key: "fecha", width: 13 },
    { header: "Proveedor", key: "proveedor", width: 28 },
    { header: "N.º factura", key: "factura", width: 16 },
    { header: "Producto", key: "producto", width: 32 },
    { header: "Cantidad", key: "cantidad", width: 10 },
    { header: "Costo unitario", key: "costo", width: 15 },
    { header: "Subtotal", key: "subtotal", width: 15 },
    { header: "Estado", key: "estado", width: 11 },
  ];
  detail.getRow(1).font = { bold: true };

  const summary = workbook.addWorksheet("Compras");
  summary.columns = [
    { header: "Compra", key: "numero", width: 9 },
    { header: "Fecha factura", key: "fecha", width: 13 },
    { header: "Proveedor", key: "proveedor", width: 28 },
    { header: "N.º factura", key: "factura", width: 16 },
    { header: "Productos", key: "productos", width: 10 },
    { header: "Total", key: "total", width: 15 },
    { header: "Forma de pago", key: "pago", width: 24 },
    { header: "Vence", key: "vence", width: 12 },
    { header: "Saldo", key: "saldo", width: 15 },
    { header: "Estado", key: "estado", width: 11 },
    { header: "Soporte", key: "soporte", width: 9 },
    { header: "Registró", key: "registro", width: 20 },
    { header: "Notas", key: "notas", width: 30 },
  ];
  summary.getRow(1).font = { bold: true };

  for (const p of (data as Purchase[] | null) ?? []) {
    const estado = p.voided_at ? "Anulada" : "Activa";
    const pago =
      p.payment_type === "credito"
        ? "A crédito"
        : p.pay_source === "caja"
          ? "Contado (caja)"
          : "Contado (por fuera de la caja)";
    summary.addRow({
      numero: p.purchase_number,
      fecha: p.purchase_date,
      proveedor: p.supplier_name ?? "",
      factura: p.invoice_number ?? "",
      productos: p.items.length,
      total: Number(p.total),
      pago,
      vence: p.due_date ?? "",
      saldo: p.voided_at ? 0 : Number(p.balance),
      estado,
      soporte: p.file_path ? "Sí" : "No",
      registro: p.created_by_name ?? "",
      notas: p.notes ?? "",
    });
    for (const item of p.items) {
      detail.addRow({
        numero: p.purchase_number,
        fecha: p.purchase_date,
        proveedor: p.supplier_name ?? "",
        factura: p.invoice_number ?? "",
        producto: item.name,
        cantidad: Number(item.quantity),
        costo: Number(item.unitCost),
        subtotal: Number(item.subtotal),
        estado,
      });
    }
  }
  for (const key of ["costo", "subtotal"]) detail.getColumn(key).numFmt = currencyFormat;
  for (const key of ["total", "saldo"]) summary.getColumn(key).numFmt = currencyFormat;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="compras-${from}-a-${to}.xlsx"`,
    },
  });
}
