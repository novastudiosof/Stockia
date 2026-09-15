"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog";
import { createCliente, updateCliente, deleteCliente } from "@/lib/actions/clientes";
import type { Cliente } from "@/lib/supabase/types";

interface ClientesTableProps {
  clientes: Cliente[];
  canEdit: boolean;
}

export function ClientesTable({ clientes, canEdit }: ClientesTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Cliente | null>(null);
  const [deleting, setDeleting] = React.useState<Cliente | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const term = search.toLowerCase();
  const filtered = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(term) ||
      (c.documento ?? "").toLowerCase().includes(term) ||
      (c.telefono ?? "").toLowerCase().includes(term)
  );

  const boundUpdate = editing ? updateCliente.bind(null, editing.id) : undefined;

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    await deleteCliente(deleting.id, deleting.nombre);
    setIsDeleting(false);
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar por nombre, documento o teléfono..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        {canEdit && (
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Agregar cliente
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Documento</th>
              <th className="p-3 font-medium">Teléfono</th>
              <th className="p-3 font-medium">Correo</th>
              <th className="p-3 font-medium">Dirección</th>
              {canEdit && <th className="p-3 font-medium text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="p-6 text-center text-brand-muted">
                  {clientes.length === 0
                    ? "Aún no tienes clientes. Se guardan automáticamente al vender, o agrégalos aquí."
                    : "No hay clientes que coincidan."}
                </td>
              </tr>
            )}
            {filtered.map((cliente) => (
              <tr key={cliente.id} className="border-b border-brand-border last:border-0">
                <td className="p-3 font-medium text-brand-ink">{cliente.nombre}</td>
                <td className="p-3 text-brand-muted">{cliente.documento || "—"}</td>
                <td className="p-3 text-brand-muted">{cliente.telefono || "—"}</td>
                <td className="p-3 text-brand-muted">{cliente.email || "—"}</td>
                <td className="p-3 text-brand-muted">{cliente.direccion || "—"}</td>
                {canEdit && (
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(cliente)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleting(cliente)}>
                        <Trash2 className="h-4 w-4 text-brand-danger" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <>
          <ClienteFormDialog open={addOpen} onOpenChange={setAddOpen} action={createCliente} />

          {editing && boundUpdate && (
            <ClienteFormDialog
              open={!!editing}
              onOpenChange={(open) => !open && setEditing(null)}
              cliente={editing}
              action={boundUpdate}
            />
          )}

          <ConfirmDialog
            open={!!deleting}
            onOpenChange={(open) => !open && setDeleting(null)}
            title="Eliminar cliente"
            description={`¿Deseas eliminar a "${deleting?.nombre}"? Las ventas ya hechas conservan sus datos; solo dejará de aparecer en el buscador. Esta acción no se puede deshacer.`}
            isLoading={isDeleting}
            onConfirm={handleDelete}
          />
        </>
      )}
    </div>
  );
}
