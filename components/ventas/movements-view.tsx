"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Paperclip, Pencil, Plus, Receipt, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MovementFormDialog } from "@/components/ventas/movement-form-dialog";
import {
  createMovement,
  updateMovement,
  deleteMovement,
  getMovementFileUrl,
} from "@/lib/actions/ventas";
import type { DailySales, Movement, MovementConcept } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function todayISO() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

type Row =
  | { kind: "movement"; day: string; movement: Movement }
  | { kind: "sales"; day: string; sales: DailySales };

interface MovementsViewProps {
  movements: Movement[];
  /** Ventas registradas desde "Ventas por Productos", agrupadas por día. */
  dailySales: DailySales[];
  concepts: MovementConcept[];
  canEdit: boolean;
}

export function MovementsView({ movements, dailySales, concepts, canEdit }: MovementsViewProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Movement | null>(null);
  const [deleting, setDeleting] = React.useState<Movement | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const inRange = (day: string) => !(from && day < from) && !(to && day > to);

  const rows: Row[] = [
    ...movements
      .filter((m) => inRange(m.occurred_at))
      .map((movement): Row => ({ kind: "movement", day: movement.occurred_at, movement })),
    ...dailySales
      .filter((d) => inRange(d.day))
      .map((sales): Row => ({ kind: "sales", day: sales.day, sales })),
  ].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    return a.kind === "sales" ? -1 : b.kind === "sales" ? 1 : 0;
  });

  const totalVentas = rows.reduce((sum, row) => {
    if (row.kind === "sales") return sum + Number(row.sales.total);
    return row.movement.type === "venta" ? sum + Number(row.movement.amount) : sum;
  }, 0);
  const totalGastos = rows.reduce(
    (sum, row) =>
      row.kind === "movement" && row.movement.type === "gasto"
        ? sum + Number(row.movement.amount)
        : sum,
    0
  );
  const balance = totalVentas - totalGastos;

  const boundUpdate = editing ? updateMovement.bind(null, editing.id) : undefined;

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    await deleteMovement(deleting.id);
    setIsDeleting(false);
    setDeleting(null);
    router.refresh();
  }

  async function handleOpenFile(filePath: string) {
    const url = await getMovementFileUrl(filePath);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">Hasta</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setFrom(todayISO());
              setTo(todayISO());
            }}
          >
            Hoy
          </Button>
          {(from || to) && (
            <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>
              Limpiar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href="/dashboard/ventas/cierre">
                <Landmark className="h-4 w-4" />
                Cierre de caja
              </Link>
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Registrar movimiento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Total ventas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-success">
            {currency.format(totalVentas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Total gastos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-danger">
            {currency.format(totalGastos)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Balance</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${balance >= 0 ? "text-brand-success" : "text-brand-danger"}`}
          >
            {currency.format(balance)}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Descripción</th>
              <th className="p-3 font-medium">Monto</th>
              <th className="p-3 font-medium">Archivo</th>
              {canEdit && <th className="p-3 font-medium text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="p-6 text-center text-brand-muted">
                  No hay movimientos en este rango.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              if (row.kind === "sales") {
                return (
                  <tr
                    key={`sales-${row.day}`}
                    className="border-b border-brand-border bg-brand/5 last:border-0"
                  >
                    <td data-label="Fecha" className="p-3">{row.day}</td>
                    <td data-label="Tipo" className="p-3">
                      <Badge variant="success">Venta</Badge>
                    </td>
                    <td data-label="Descripción" className="p-3">
                      <p className="flex items-center gap-1.5 font-medium text-brand-ink">
                        <Receipt className="h-4 w-4 text-brand" />
                        Ventas registradas
                      </p>
                      <p className="text-xs text-brand-muted">
                        {row.sales.sales_count}{" "}
                        {row.sales.sales_count === 1 ? "venta" : "ventas"} por productos
                      </p>
                    </td>
                    <td data-label="Monto" className="p-3 font-medium">
                      {currency.format(row.sales.total)}
                    </td>
                    <td data-label="Archivo" className="p-3">—</td>
                    <td data-label="" className="p-3">
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/dashboard/ventas/dia/${row.day}`}>Ver detalle</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const movement = row.movement;
              return (
                <tr key={movement.id} className="border-b border-brand-border last:border-0">
                  <td data-label="Fecha" className="p-3">{movement.occurred_at}</td>
                  <td data-label="Tipo" className="p-3">
                    <Badge variant={movement.type === "venta" ? "success" : "danger"}>
                      {movement.type === "venta" ? "Venta" : "Gasto"}
                    </Badge>
                  </td>
                  <td data-label="Descripción" className="p-3">
                    {movement.concept && (
                      <p className="font-medium text-brand-ink">{movement.concept}</p>
                    )}
                    <p className="text-brand-muted">
                      {movement.description || (movement.concept ? "" : "—")}
                    </p>
                  </td>
                  <td data-label="Monto" className="p-3 font-medium">
                    {currency.format(movement.amount)}
                  </td>
                  <td data-label="Archivo" className="p-3">
                    {movement.file_path ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenFile(movement.file_path as string)}
                        aria-label="Ver archivo adjunto"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                  {canEdit && (
                    <td data-label="" className="p-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(movement)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(movement)}>
                          <Trash2 className="h-4 w-4 text-brand-danger" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MovementFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        action={createMovement}
        concepts={concepts}
        warnNoEdit={!canEdit}
      />

      {canEdit && editing && boundUpdate && (
        <MovementFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          movement={editing}
          concepts={concepts}
          action={boundUpdate}
        />
      )}

      {canEdit && (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Eliminar movimiento"
          description="¿Deseas eliminar este movimiento? Esta acción no se puede deshacer."
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
