"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { InvoiceFormDialog } from "@/components/facturas/invoice-form-dialog";
import {
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceFileUrl,
} from "@/lib/actions/facturas";
import type { Invoice } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface InvoicesTableProps {
  invoices: Invoice[];
  canEdit: boolean;
}

export function InvoicesTable({ invoices, canEdit }: InvoicesTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Invoice | null>(null);
  const [deleting, setDeleting] = React.useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const filtered = invoices.filter(
    (invoice) =>
      invoice.provider.toLowerCase().includes(search.toLowerCase()) ||
      invoice.invoice_number.toLowerCase().includes(search.toLowerCase())
  );

  const boundUpdate = editing
    ? updateInvoice.bind(null, editing.id, editing.file_path)
    : undefined;

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    await deleteInvoice(deleting.id, deleting.file_path, deleting.provider);
    setIsDeleting(false);
    setDeleting(null);
    router.refresh();
  }

  async function handleOpenFile(filePath: string) {
    const url = await getInvoiceFileUrl(filePath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar por proveedor o número..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar factura
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Proveedor</th>
              <th className="p-3 font-medium">N° factura</th>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Monto</th>
              <th className="p-3 font-medium text-right">Acciones</th>
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
            {filtered.map((invoice) => (
              <tr key={invoice.id} className="border-b border-brand-border last:border-0">
                <td className="p-3 font-medium text-brand-ink">{invoice.provider}</td>
                <td className="p-3">{invoice.invoice_number}</td>
                <td className="p-3">{invoice.occurred_at}</td>
                <td className="p-3">{currency.format(invoice.amount)}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {invoice.file_path && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenFile(invoice.file_path!)}
                        aria-label="Ver adjunto"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => setEditing(invoice)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(invoice)}>
                          <Trash2 className="h-4 w-4 text-brand-danger" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        action={createInvoice}
        warnNoEdit={!canEdit}
      />

      {canEdit && editing && boundUpdate && (
        <InvoiceFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          invoice={editing}
          action={boundUpdate}
        />
      )}

      {canEdit && (
        <ConfirmDialog
          open={!!deleting}
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Eliminar factura"
          description={`¿Deseas eliminar la factura de "${deleting?.provider}"? Esta acción no se puede deshacer.`}
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
