import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface InventarioReportCardProps {
  totalProductos: number;
  productosStockBajo: number;
}

export function InventarioReportCard({
  totalProductos,
  productosStockBajo,
}: InventarioReportCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventario</CardTitle>
        <CardDescription>
          Descarga el listado completo de productos con su stock actual.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm text-brand-muted">
          <span>{totalProductos} productos en catálogo</span>
          {productosStockBajo > 0 && (
            <Badge variant="danger">{productosStockBajo} con stock bajo</Badge>
          )}
        </div>
        <Button asChild className="w-fit">
          <a href="/api/reportes/inventario">
            <Download className="h-4 w-4" />
            Exportar a Excel
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
