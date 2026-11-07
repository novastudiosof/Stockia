"use client";

import * as React from "react";
import { Download, Eye, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getInvoiceFileUrl } from "@/lib/actions/facturas";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Una factura/soporte: puede venir de un gasto con adjunto o ser una factura antigua. */
export interface InvoiceRow {
  id: string;
  source: "gasto" | "factura";
  title: string;
  subtitle: string;
  date: string;
  amount: number;
  filePath: string | null;
}

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  const [search, setSearch] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!term ||
        row.title.toLowerCase().includes(term) ||
        row.subtitle.toLowerCase().includes(term)) &&
      (!from || row.date >= from) &&
      (!to || row.date <= to)
  );

  async function handleFile(row: InvoiceRow, download: boolean) {
    if (!row.filePath) return;
    setBusyId(row.id);
    setError(null);
    const url = await getInvoiceFileUrl(row.filePath, download);
    setBusyId(null);
    if (!url) {
      setError("No se pudo abrir el archivo");
      return;
    }
    if (download) {
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar por proveedor, concepto o número..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          aria-label="Desde"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-auto"
        />
        <Input
          type="date"
          aria-label="Hasta"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-auto"
        />
      </div>

      {error && <p className="text-sm text-brand-danger">{error}</p>}

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Detalle</th>
              <th className="p-3 font-medium">Origen</th>
              <th className="p-3 font-medium">Monto</th>
              <th className="p-3 font-medium text-right">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-brand-muted">
                  No hay facturas que coincidan.
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr key={`${row.source}-${row.id}`} className="border-b border-brand-border last:border-0">
                <td data-label="Fecha" className="p-3">{row.date}</td>
                <td data-label="Detalle" className="p-3">
                  <p className="font-medium text-brand-ink">{row.title}</p>
                  {row.subtitle && <p className="text-xs text-brand-muted">{row.subtitle}</p>}
                </td>
                <td data-label="Origen" className="p-3">
                  <Badge variant={row.source === "gasto" ? "danger" : "muted"}>
                    {row.source === "gasto" ? "Gasto" : "Factura"}
                  </Badge>
                </td>
                <td data-label="Monto" className="p-3">{currency.format(row.amount)}</td>
                <td data-label="" className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === row.id}
                      onClick={() => handleFile(row, false)}
                      aria-label="Ver archivo"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busyId === row.id}
                      onClick={() => handleFile(row, true)}
                      aria-label="Descargar archivo"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
