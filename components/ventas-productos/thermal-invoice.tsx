"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DownloadInvoiceButton } from "@/components/ventas-productos/download-invoice-button";
import type { CustomerSnapshot, Organization, SaleItem } from "@/lib/supabase/types";
import { summarizeTaxes } from "@/lib/tax";

type Width = "58" | "80";

interface ThermalInvoiceProps {
  invoiceNumber: string;
  dateLabel: string;
  voided: boolean;
  customer: CustomerSnapshot | null;
  items: SaleItem[];
  total: number;
  organization: Organization;
  soldBy?: string | null;
  paymentText?: string | null;
  saleId?: string;
}

export function ThermalInvoice({
  invoiceNumber,
  dateLabel,
  voided,
  customer,
  items,
  total,
  organization,
  soldBy,
  paymentText,
  saleId,
}: ThermalInvoiceProps) {
  const [width, setWidth] = React.useState<Width>("80");

  // Si la organización guardó un código de moneda que parece válido (3
  // letras) pero no es un ISO-4217 real, Intl.NumberFormat lanza en vez de
  // solo formatear mal — sin este try/catch, esa venta jamás podría
  // imprimirse hasta que alguien corrigiera la moneda en Super Admin.
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

  // Ancho que de verdad imprime la cabeza térmica: 58mm de papel = 48mm útiles
  // (384 puntos); 80mm de papel = 72mm útiles. Más que eso se corta a la derecha.
  const printable = width === "58" ? 47 : 72;

  const taxRows = summarizeTaxes(items);
  const taxSum = taxRows.reduce((sum, row) => sum + row.tax, 0);

  return (
    <div>
      {/* @page controla el tamaño de página real al imprimir/guardar como
          PDF; se regenera cada vez que cambia el ancho elegido. */}
      <style>{`
        @page { size: ${width}mm auto; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: ${width}mm; }
          body * { visibility: hidden; }
          .ticket-print, .ticket-print * { visibility: visible; }
          .ticket-print {
            position: absolute; top: 0; left: ${width === "58" ? "5mm" : "0"}; margin: 0 !important;
            width: ${printable}mm !important; box-sizing: border-box;
            padding: ${width === "58" ? "1mm" : "2mm"} !important;
            border: none; overflow-wrap: anywhere; word-break: break-word;
            font-size: ${width === "58" ? "11px" : "12px"};
            font-weight: 600; color: #000 !important; background: #fff;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .ticket-print * { color: #000 !important; border-color: #000 !important; }
          .ticket-print span { min-width: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-xs">
          {(["58", "80"] as Width[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={`rounded-[var(--radius-brand-sm)] px-3 py-1 transition-colors ${
                width === w ? "bg-brand text-brand-ink" : "text-brand-muted"
              }`}
            >
              {w}mm
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {saleId && (
            <DownloadInvoiceButton saleId={saleId} widthMm={width === "58" ? 58 : 80} />
          )}
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      <div
        className="ticket-print mx-auto flex flex-col gap-2 border border-dashed border-brand-border bg-white p-3 font-mono text-[11px] leading-snug text-brand-ink"
        style={{ width: `${printable}mm`, fontSize: width === "58" ? "11px" : undefined }}
      >
        <div className="flex flex-col items-center text-center">
          <p className="font-bold">{organization.legal_name || organization.name}</p>
          {organization.tax_id && (
            <p>
              NIT: {organization.tax_id}
              {organization.tax_dv ? `-${organization.tax_dv}` : ""}
            </p>
          )}
          {organization.tax_regime && <p>{organization.tax_regime}</p>}
          {organization.billing_address && (
            <p>
              {organization.billing_address}
              {organization.billing_city ? ` - ${organization.billing_city}` : ""}
            </p>
          )}
          {organization.billing_phone && <p>Tel: {organization.billing_phone}</p>}
        </div>

        <div className="border-t border-dashed border-brand-muted pt-2 text-center">
          <p className="font-bold">FACTURA DE VENTA</p>
          <p>N.º {invoiceNumber}</p>
          <p>{dateLabel}</p>
          {voided && <p className="font-bold">*** ANULADA ***</p>}
        </div>

        <div className="border-t border-dashed border-brand-muted pt-2">
          <p>Cliente: {customer?.nombre ?? "Consumidor final"}</p>
          {customer?.documento && (
            <p>
              {customer.tipo_documento ? `${customer.tipo_documento}: ` : "Doc: "}
              {customer.documento}
            </p>
          )}
          {customer?.telefono && <p>Tel: {customer.telefono}</p>}
          {soldBy && <p>Vendido por: {soldBy}</p>}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-dashed border-brand-muted pt-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex flex-col">
              <span>{item.name}</span>
              <div className="flex justify-between">
                <span>
                  {item.quantity} x{" "}
                  {money(
                    item.taxRate && item.taxRate > 0 ? item.subtotal / item.quantity : item.unitPrice
                  )}
                </span>
                <span>{money(item.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        {taxSum > 0 && (
          <div className="flex flex-col border-t border-dashed border-brand-muted pt-2">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(total - taxSum)}</span>
            </div>
            {taxRows.map((row) => (
              <div key={row.label} className="flex justify-between">
                <span>{row.label}</span>
                <span>{money(row.tax)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between border-t border-dashed border-brand-muted pt-2 font-bold">
          <span>TOTAL</span>
          <span>{money(total)}</span>
        </div>
        {paymentText && <p className="pt-1">Pago: {paymentText}</p>}

        {organization.invoice_resolution_number && (
          <p className="border-t border-dashed border-brand-muted pt-2 text-center">
            Resolución DIAN {organization.invoice_resolution_number}
            {organization.invoice_resolution_from != null &&
            organization.invoice_resolution_to != null
              ? ` · rango ${organization.invoice_prefix || ""}${organization.invoice_resolution_from} a ${organization.invoice_prefix || ""}${organization.invoice_resolution_to}`
              : ""}
            {organization.invoice_resolution_valid_until
              ? ` · vigente hasta ${organization.invoice_resolution_valid_until}`
              : ""}
          </p>
        )}

        {organization.invoice_footer && (
          <p className="border-t border-dashed border-brand-muted pt-2 text-center">
            {organization.invoice_footer}
          </p>
        )}
      </div>
    </div>
  );
}
