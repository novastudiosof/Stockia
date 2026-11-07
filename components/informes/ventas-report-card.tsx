"use client";

import * as React from "react";
import { Download, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ReportPreviewDialog,
  type PreviewColumn,
} from "@/components/informes/report-preview-dialog";
import { previewMovements, type MovementPreviewRow } from "@/lib/actions/informes";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const COLUMNS: PreviewColumn<MovementPreviewRow>[] = [
  { header: "Fecha", cell: (m) => m.occurred_at },
  {
    header: "Tipo",
    cell: (m) =>
      m.kind === "gasto" ? (
        <Badge variant="danger">Gasto</Badge>
      ) : (
        <Badge variant="success">Venta</Badge>
      ),
  },
  { header: "Concepto", cell: (m) => m.concept || "—" },
  { header: "Descripción", cell: (m) => m.description || "—" },
  { header: "Monto", className: "font-medium", cell: (m) => currency.format(m.amount) },
];

export function VentasReportCard() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const filters = React.useMemo(() => ({ from, to }), [from, to]);

  const href = `/api/reportes/ventas?${new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString()}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas y Gastos</CardTitle>
        <CardDescription>
          Revisa el detalle de movimientos en un rango de fechas y descárgalo en Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportFrom">Desde</Label>
            <Input id="reportFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reportTo">Hasta</Label>
            <Input id="reportTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
          Deja las fechas vacías para incluir todo el historial.
        </p>
      </CardContent>

      <ReportPreviewDialog<MovementPreviewRow>
        open={open}
        onOpenChange={setOpen}
        title="Ventas y Gastos"
        description={`${from || "inicio"} a ${to || "hoy"}`}
        resetKey={JSON.stringify(filters)}
        loadPage={(cursor) => previewMovements(filters, cursor)}
        columns={COLUMNS}
        rowKey={(m) => m.id}
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
