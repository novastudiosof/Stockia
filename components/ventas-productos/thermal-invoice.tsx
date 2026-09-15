"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CustomerSnapshot, Organization, SaleItem } from "@/lib/supabase/types";

type Width = "58" | "80";

interface ThermalInvoiceProps {
  invoiceNumber: string;
  dateLabel: string;
  voided: boolean;
  customer: CustomerSnapshot | null;
  items: SaleItem[];
  total: number;
  organization: Organization;
}

export function ThermalInvoice({
  invoiceNumber,
  dateLabel,
  voided,
  customer,
  items,
  total,
  organization,
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

  return (
    <div>
      {/* @page controla el tamaño de página real al imprimir/guardar como
          PDF; se regenera cada vez que cambia el ancho elegido. */}
      <style>{`
        @page { size: ${width}mm auto; margin: 2mm; }
        @media print {
          body * { visibility: hidden; }
          .ticket-print, .ticket-print * { visibility: visible; }
          .ticket-print { position: absolute; top: 0; left: 0; border: none; }
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
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir
        </Button>
      </div>

      <div
        className="ticket-print mx-auto flex flex-col gap-2 border border-dashed border-brand-border bg-white p-3 font-mono text-[11px] leading-snug text-brand-ink"
        style={{ width: `${width}mm` }}
      >
        <div className="flex flex-col items-center text-center">
          <p className="font-bold">{organization.legal_name || organization.name}</p>
          {organization.tax_id && <p>NIT: {organization.tax_id}</p>}
          {organization.billing_address && <p>{organization.billing_address}</p>}
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
          {customer?.documento && <p>Doc: {customer.documento}</p>}
          {customer?.telefono && <p>Tel: {customer.telefono}</p>}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-dashed border-brand-muted pt-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex flex-col">
              <span>{item.name}</span>
              <div className="flex justify-between">
                <span>
                  {item.quantity} x {money(item.unitPrice)}
                </span>
                <span>{money(item.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between border-t border-dashed border-brand-muted pt-2 font-bold">
          <span>TOTAL</span>
          <span>{money(total)}</span>
        </div>

        {organization.invoice_footer && (
          <p className="border-t border-dashed border-brand-muted pt-2 text-center">
            {organization.invoice_footer}
          </p>
        )}
      </div>
    </div>
  );
}
