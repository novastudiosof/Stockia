"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Descarga el Excel de compras del rango elegido (por fecha de la factura). */
export function ExportPurchases({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = React.useState(defaultFrom);
  const [to, setTo] = React.useState(defaultTo);
  const valid = !!from && !!to && from <= to;
  const href = `/api/reportes/compras?${new URLSearchParams({ desde: from, hasta: to })}`;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exp-from">Desde</Label>
        <Input id="exp-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="exp-to">Hasta</Label>
        <Input id="exp-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>
      {valid ? (
        <Button variant="outline" asChild>
          <a href={href}>
            <Download className="h-4 w-4" />
            Descargar Excel
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          <Download className="h-4 w-4" />
          Descargar Excel
        </Button>
      )}
    </div>
  );
}
