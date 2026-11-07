"use client";

import * as React from "react";
import { Download, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ReportPreviewDialog,
  type PreviewColumn,
} from "@/components/informes/report-preview-dialog";
import { previewInventory, type InventoryPreviewRow } from "@/lib/actions/informes";

const LOW_STOCK_THRESHOLD = 10;

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const COLUMNS: PreviewColumn<InventoryPreviewRow>[] = [
  { header: "Categoría", cell: (p) => p.category },
  { header: "Producto", className: "font-medium", cell: (p) => p.name },
  { header: "Código", cell: (p) => p.barcode || "—" },
  {
    header: "Cantidad",
    cell: (p) =>
      p.quantity <= LOW_STOCK_THRESHOLD ? (
        <Badge variant="danger">{p.quantity}</Badge>
      ) : (
        p.quantity
      ),
  },
  { header: "Compra", cell: (p) => currency.format(p.purchase_price) },
  { header: "Venta", cell: (p) => currency.format(p.sale_price) },
];

interface InventarioReportCardProps {
  totalProductos: number;
  productosStockBajo: number;
}

export function InventarioReportCard({
  totalProductos,
  productosStockBajo,
}: InventarioReportCardProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const filters = React.useMemo(() => ({ query: query.trim() }), [query]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventario</CardTitle>
        <CardDescription>
          Revisa el listado de productos con su stock actual y descárgalo en Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm text-brand-muted">
          <span>{totalProductos} productos en catálogo</span>
          {productosStockBajo > 0 && (
            <Badge variant="danger">{productosStockBajo} con stock bajo</Badge>
          )}
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="reportInvQuery">Buscar producto o código (solo para Ver)</Label>
          <Input
            id="reportInvQuery"
            placeholder="Nombre o código de barras..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setOpen(true)}>
            <Eye className="h-4 w-4" />
            Ver
          </Button>
          <Button asChild variant="outline">
            <a href="/api/reportes/inventario">
              <Download className="h-4 w-4" />
              Exportar a Excel
            </a>
          </Button>
        </div>
      </CardContent>

      <ReportPreviewDialog<InventoryPreviewRow>
        open={open}
        onOpenChange={setOpen}
        title="Inventario"
        description={filters.query ? `Filtrado por «${filters.query}»` : "Todos los productos"}
        resetKey={JSON.stringify(filters)}
        loadPage={(cursor) => previewInventory(filters, cursor)}
        columns={COLUMNS}
        rowKey={(p) => p.id}
        footer={
          <Button asChild variant="outline" size="sm">
            <a href="/api/reportes/inventario">
              <Download className="h-4 w-4" />
              Descargar inventario completo en Excel
            </a>
          </Button>
        }
      />
    </Card>
  );
}
