"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MovementFormDialog } from "@/components/ventas/movement-form-dialog";
import { createMovement, updateMovement, deleteMovement } from "@/lib/actions/ventas";
import type { Movement } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

interface MovementsViewProps {
  movements: Movement[];
}

export function MovementsView({ movements }: MovementsViewProps) {
  const router = useRouter();
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Movement | null>(null);
  const [deleting, setDeleting] = React.useState<Movement | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const filtered = movements.filter((m) => {
    if (from && m.occurred_at < from) return false;
    if (to && m.occurred_at > to) return false;
    return true;
  });

  const totalVentas = filtered
    .filter((m) => m.type === "venta")
    .reduce((sum, m) => sum + Number(m.amount), 0);
  const totalGastos = filtered
    .filter((m) => m.type === "gasto")
    .reduce((sum, m) => sum + Number(m.amount), 0);
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
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar movimiento
        </Button>
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
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Descripción</th>
              <th className="p-3 font-medium">Monto</th>
              <th className="p-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-brand-muted">
                  No hay movimientos en este rango.
                </td>
              </tr>
            )}
            {filtered.map((movement) => (
              <tr key={movement.id} className="border-b border-brand-border last:border-0">
                <td className="p-3">{movement.occurred_at}</td>
                <td className="p-3">
                  <Badge variant={movement.type === "venta" ? "success" : "danger"}>
                    {movement.type === "venta" ? "Venta" : "Gasto"}
                  </Badge>
                </td>
                <td className="p-3 text-brand-muted">{movement.description || "—"}</td>
                <td className="p-3 font-medium">{currency.format(movement.amount)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(movement)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(movement)}>
                      <Trash2 className="h-4 w-4 text-brand-danger" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MovementFormDialog open={addOpen} onOpenChange={setAddOpen} action={createMovement} />

      {editing && boundUpdate && (
        <MovementFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          movement={editing}
          action={boundUpdate}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar movimiento"
        description="¿Deseas eliminar este movimiento? Esta acción no se puede deshacer."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
