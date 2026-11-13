"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Eye, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ReportPreviewDialog,
  type PreviewColumn,
} from "@/components/informes/report-preview-dialog";
import { DownloadInvoiceButton } from "@/components/ventas-productos/download-invoice-button";
import { WhatsappInvoiceButton } from "@/components/ventas-productos/whatsapp-invoice-button";
import { previewSales, type SalesPreviewRow } from "@/lib/actions/informes";
import { getInvoiceTicket } from "@/lib/actions/ventas-productos";
import { paymentDetail, paymentLabel } from "@/lib/payments";
import { todayBogota } from "@/lib/dates";
import type { Sale } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

/** Detalle de una venta: se pide al abrir la fila, no con la lista. */
function SaleDetail({ saleId }: { saleId: string }) {
  const [sale, setSale] = React.useState<Sale | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    getInvoiceTicket(saleId)
      .then((result) => {
        if (!active) return;
        if (result.sale) setSale(result.sale);
        else setError(result.error ?? "No se pudo cargar el detalle");
      })
      .catch(() => active && setError("No se pudo cargar el detalle"));
    return () => {
      active = false;
    };
  }, [saleId]);

  if (error) return <p className="text-sm text-brand-danger">{error}</p>;
  if (!sale) return <p className="text-sm text-brand-muted">Cargando detalle...</p>;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <ul className="flex flex-col gap-1">
        {sale.items.map((item) => (
          <li key={item.productId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {item.quantity} × {item.name}
              <span className="text-brand-muted"> ({currency.format(item.taxRate && item.taxRate > 0 ? item.subtotal / item.quantity : item.unitPrice)} c/u)</span>
            </span>
            <span className="shrink-0 font-medium">{currency.format(item.subtotal)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-brand-border pt-2 text-xs text-brand-muted">
        Pago: {paymentDetail(sale, (n) => currency.format(n)) || paymentLabel(sale)}
        {sale.sold_by_name ? ` · Vendido por ${sale.sold_by_name}` : ""}
        {sale.customer_snapshot?.telefono ? ` · Tel. ${sale.customer_snapshot.telefono}` : ""}
      </p>
    </div>
  );
}

const COLUMNS: PreviewColumn<SalesPreviewRow>[] = [
  {
    header: "N.º",
    cell: (s) => s.sale_number ?? "—",
  },
  { header: "Fecha", cell: (s) => dateTime.format(new Date(s.created_at)) },
  {
    header: "Cliente",
    cell: (s) => (
      <span>
        {s.customer_snapshot?.nombre || "Consumidor final"}
        {s.customer_snapshot?.documento && (
          <span className="block text-xs text-brand-muted">{s.customer_snapshot.documento}</span>
        )}
      </span>
    ),
  },
  { header: "Pago", cell: (s) => paymentLabel(s) },
  {
    header: "Total",
    className: "font-medium",
    cell: (s) =>
      s.voided_at ? (
        <span className="flex items-center gap-2">
          <span className="line-through">{currency.format(s.total)}</span>
          <Badge variant="danger">{s.void_kind === "devolucion" ? "Devuelta" : "Anulada"}</Badge>
        </span>
      ) : (
        currency.format(s.total)
      ),
  },
];

export function VentasProductosReportCard() {
  // Por defecto, las ventas del día de hoy (hora de Colombia).
  const [from, setFrom] = React.useState(() => todayBogota());
  const [to, setTo] = React.useState(() => todayBogota());
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filters = React.useMemo(
    () => ({ from, to, query: query.trim() }),
    [from, to, query]
  );

  const href = `/api/reportes/ventas-productos?${new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(filters.query ? { q: filters.query } : {}),
  }).toString()}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas por Productos</CardTitle>
        <CardDescription>
          Consulta las ventas por fecha o cliente, revisa su detalle y reenvía la factura. También
          puedes exportarlas a Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportVpFrom">Desde</Label>
            <Input
              id="reportVpFrom"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportVpTo">Hasta</Label>
            <Input id="reportVpTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <Label htmlFor="reportVpQuery">Cliente o N.º de factura</Label>
            <Input
              id="reportVpQuery"
              placeholder="Nombre, documento o número..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setOpen(true)}>
            <Eye className="h-4 w-4" />
            Ver
          </Button>
          <Button asChild variant="outline">
            <a href={href}>
              <Download className="h-4 w-4" />
              Exportar a Excel
            </a>
          </Button>
        </div>
        <p className="text-xs text-brand-muted">
          Deja las fechas vacías para incluir todo el historial. El Excel respeta los mismos filtros.
        </p>
      </CardContent>

      <ReportPreviewDialog<SalesPreviewRow>
        open={open}
        onOpenChange={setOpen}
        title="Ventas por Productos"
        description={`${from || "inicio"} a ${to || "hoy"}${filters.query ? ` · «${filters.query}»` : ""}`}
        resetKey={JSON.stringify(filters)}
        loadPage={(cursor) => previewSales(filters, cursor)}
        columns={COLUMNS}
        rowKey={(s) => s.id}
        rowClassName={(s) => (s.voided_at ? "text-brand-muted" : undefined)}
        renderExpanded={(s) => <SaleDetail saleId={s.id} />}
        renderActions={(s) => (
          <>
            <DownloadInvoiceButton saleId={s.id} display="icon" />
            <WhatsappInvoiceButton
              saleId={s.id}
              display="icon"
              phone={s.customer_snapshot?.telefono}
            />
            <Button variant="ghost" size="icon" asChild aria-label="Imprimir factura">
              <Link href={`/dashboard/ventas-productos/${s.id}/factura`} target="_blank">
                <Printer className="h-4 w-4" />
              </Link>
            </Button>
          </>
        )}
        footer={
          <Button asChild variant="outline" size="sm">
            <a href={href}>
              <Download className="h-4 w-4" />
              Descargar este informe en Excel
            </a>
          </Button>
        }
      />
    </Card>
  );
}

