"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getInvoiceTicket } from "@/lib/actions/ventas-productos";
import { paymentDetail, paymentLabel } from "@/lib/payments";
import { buildTicketPdf } from "@/lib/ticket-pdf";

interface DownloadInvoiceButtonProps {
  saleId: string;
  widthMm?: 58 | 80;
  /** "icon" para filas de tabla; "button" muestra el texto. */
  display?: "button" | "icon";
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

/**
 * Descarga la factura de una venta como PDF en el equipo desde el que se
 * pulsa (celular, tablet o computador). El PDF se arma en el navegador.
 */
export function DownloadInvoiceButton({
  saleId,
  widthMm = 80,
  display = "button",
  variant = "outline",
  size = "default",
}: DownloadInvoiceButtonProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDownload() {
    setBusy(true);
    setError(null);
    try {
      const result = await getInvoiceTicket(saleId);
      if (result.error || !result.sale || !result.organization) {
        setError(result.error ?? "No se pudo obtener la factura");
        return;
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

      const blob = buildTicketPdf(
        {
          orgName: organization.legal_name || organization.name,
          taxId: organization.tax_id,
          address: organization.billing_address,
          phone: organization.billing_phone,
          invoiceNumber,
          dateLabel: dateTime.format(new Date(sale.created_at)),
          voided: Boolean(sale.voided_at),
          customerName: sale.customer_snapshot?.nombre ?? "Consumidor final",
          customerDocument: sale.customer_snapshot?.documento ?? null,
          customerPhone: sale.customer_snapshot?.telefono ?? null,
          soldBy: sale.sold_by_name,
          items: sale.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unitPrice: money(item.unitPrice),
            subtotal: money(item.subtotal),
          })),
          total: money(sale.total),
          paymentText:
            sale.payment_method === "mixto"
              ? `Mixto (${paymentDetail(sale, money)})`
              : paymentLabel(sale),
          footer: organization.invoice_footer,
        },
        widthMm
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `factura-${invoiceNumber}.pdf`.replace(/[^\w.\-]+/g, "_");
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("No se pudo generar el PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {display === "icon" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleDownload}
          disabled={busy}
          aria-label="Descargar factura en PDF"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
      ) : (
        <Button type="button" variant={variant} size={size} onClick={handleDownload} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Descargar PDF
        </Button>
      )}
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </>
  );
}
