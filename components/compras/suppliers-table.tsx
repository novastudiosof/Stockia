"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SupplierFormDialog } from "@/components/compras/supplier-form-dialog";
import { createSupplier, deleteSupplier, updateSupplier } from "@/lib/actions/compras";
import type { Supplier } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface SuppliersTableProps {
  suppliers: Supplier[];
  /** Lo que se le debe a cada proveedor (id -> valor). */
  debts: Record<string, number>;
}

export function SuppliersTable({ suppliers, debts }: SuppliersTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [deleting, setDeleting] = React.useState<Supplier | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = suppliers.filter(
    (s) =>
      s.nombre.toLowerCase().includes(term) ||
      (s.nit ?? "").toLowerCase().includes(term) ||
      (s.telefono ?? "").toLowerCase().includes(term)
  );
  const boundUpdate = editing ? updateSupplier.bind(null, editing.id) : undefined;

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    setError(null);
    const result = await deleteSupplier(deleting.id, deleting.nombre);
    setBusy(false);
    setDeleting(null);
    if (result.error) setError(result.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar por nombre, NIT o teléfono..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar proveedor
        </Button>
      </div>

      {error && <p className="text-sm text-brand-danger">{error}</p>}

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Proveedor</th>
              <th className="p-3 font-medium">NIT</th>
              <th className="p-3 font-medium">Teléfono</th>
              <th className="p-3 font-medium">Se le debe</th>
              <th className="p-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-brand-muted">
                  {suppliers.length === 0 ? "Aún no tienes proveedores." : "No hay proveedores que coincidan."}
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-brand-border last:border-0">
                <td data-label="Proveedor" className="p-3">
                  <span className="font-medium text-brand-ink">{s.nombre}</span>
                  {s.notas && <span className="block text-xs text-brand-muted">{s.notas}</span>}
                </td>
                <td data-label="NIT" className="p-3 text-brand-muted">{s.nit || "—"}</td>
                <td data-label="Teléfono" className="p-3 text-brand-muted">{s.telefono || "—"}</td>
                <td data-label="Se le debe" className="p-3">
                  {debts[s.id] ? (
                    <span className="font-medium text-brand-danger">{currency.format(debts[s.id])}</span>
                  ) : (
                    <span className="text-brand-muted">—</span>
                  )}
                </td>
                <td data-label="" className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" aria-label="Editar proveedor" onClick={() => setEditing(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Eliminar proveedor" onClick={() => setDeleting(s)}>
                      <Trash2 className="h-4 w-4 text-brand-danger" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SupplierFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        action={createSupplier}
        onSaved={() => router.refresh()}
      />
      {editing && boundUpdate && (
        <SupplierFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          supplier={editing}
          action={boundUpdate}
          onSaved={() => router.refresh()}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar proveedor"
        description={`¿Deseas eliminar a "${deleting?.nombre}"? Las compras ya registradas conservan su nombre.`}
        isLoading={busy}
        onConfirm={handleDelete}
      />
    </div>
  );
}
