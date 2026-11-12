import { getInvoiceTicket } from "@/lib/actions/ventas-productos";
import { paymentDetail, paymentLabel } from "@/lib/payments";
import { buildTicketPdf } from "@/lib/ticket-pdf";
import { summarizeTaxes } from "@/lib/tax";

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

export interface BuiltInvoice {
  blob: Blob;
  fileName: string;
  invoiceNumber: string;
  orgName: string;
  totalText: string;
  customerName: string;
  customerPhone: string | null;
}

/** Arma el PDF de la factura de una venta en el navegador. */
export async function buildInvoicePdf(
  saleId: string,
  widthMm: 58 | 80 = 80
): Promise<{ error: string } | BuiltInvoice> {
  const result = await getInvoiceTicket(saleId);
  if (result.error || !result.sale || !result.organization) {
    return { error: result.error ?? "No se pudo obtener la factura" };
  }
  const { sale, organization } = result;

  const money = (value: number) => {
    try {
      return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: organization.currency || "COP",
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${organization.currency || "COP"} ${value.toLocaleString("es-CO")}`;
    }
  };

  const invoiceNumber = sale.sale_number
    ? `${organization.invoice_prefix || ""}${sale.sale_number}`
    : sale.id.slice(0, 8).toUpperCase();
  const orgName = organization.legal_name || organization.name;
  const customerName = sale.customer_snapshot?.nombre ?? "Consumidor final";
  const taxRows = summarizeTaxes(sale.items);
  const taxSum = taxRows.reduce((sum, row) => sum + row.tax, 0);

  const blob = buildTicketPdf(
    {
      orgName,
      taxId: organization.tax_id
        ? `${organization.tax_id}${organization.tax_dv ? `-${organization.tax_dv}` : ""}`
        : null,
      address: organization.billing_address,
      phone: organization.billing_phone,
      invoiceNumber,
      dateLabel: dateTime.format(new Date(sale.created_at)),
      voided: Boolean(sale.voided_at),
      customerName,
      customerDocument: sale.customer_snapshot?.documento
        ? `${sale.customer_snapshot.tipo_documento ? `${sale.customer_snapshot.tipo_documento} ` : ""}${sale.customer_snapshot.documento}`
        : null,
      customerPhone: sale.customer_snapshot?.telefono ?? null,
      soldBy: sale.sold_by_name,
      items: sale.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: money(
          item.taxRate && item.taxRate > 0 ? item.subtotal / item.quantity : item.unitPrice
        ),
        subtotal: money(item.subtotal),
      })),
      subtotal: taxSum > 0 ? money(sale.total - taxSum) : undefined,
      taxLines: taxRows.map((row) => ({ label: row.label, amount: money(row.tax) })),
      total: money(sale.total),
      paymentText:
        sale.payment_method === "mixto"
          ? `Mixto (${paymentDetail(sale, money)})`
          : paymentLabel(sale),
      footer: organization.invoice_footer,
    },
    widthMm
  );

  return {
    blob,
    fileName: `factura-${invoiceNumber}.pdf`.replace(/[^\w.\-]+/g, "_"),
    invoiceNumber,
    orgName,
    totalText: money(sale.total),
    customerName,
    customerPhone: sale.customer_snapshot?.telefono ?? null,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Deja solo dígitos y agrega el indicativo de Colombia (57) a los celulares
 * de 10 dígitos. Devuelve null si el número no parece válido.
 */
export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("3")) digits = `57${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
