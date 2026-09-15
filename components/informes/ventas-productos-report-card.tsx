"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function VentasProductosReportCard() {
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const href = `/api/reportes/ventas-productos?${new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString()}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas por Productos</CardTitle>
        <CardDescription>
          Descarga el detalle de ventas del carrito, con cliente y productos vendidos.
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
        </div>
        <Button asChild className="w-fit">
          <a href={href}>
            <Download className="h-4 w-4" />
            Exportar a Excel
          </a>
        </Button>
        <p className="text-xs text-brand-muted">
          Deja las fechas vacías para exportar todo el historial.
        </p>
      </CardContent>
    </Card>
  );
}
