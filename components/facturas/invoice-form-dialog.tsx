"use client";

import * as React from "react";
import { useActionState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Invoice } from "@/lib/supabase/types";

interface InvoiceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: Invoice;
  warnNoEdit?: boolean;
  action: (prev: { error?: string } | void, formData: FormData) => Promise<{ error?: string } | void>;
}

const today = () => new Date().toISOString().slice(0, 10);

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
  warnNoEdit = false,
  action,
}: InvoiceFormDialogProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state && !state.error) {
      onOpenChange(false);
      formRef.current?.reset();
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{invoice ? "Editar factura" : "Nueva factura"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4" encType="multipart/form-data">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="provider">Proveedor</Label>
            <Input id="provider" name="provider" defaultValue={invoice?.provider} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoiceNumber">N° de factura</Label>
              <Input
                id="invoiceNumber"
                name="invoiceNumber"
                defaultValue={invoice?.invoice_number}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0}
                step="0.01"
                defaultValue={invoice?.amount}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occurredAt">Fecha</Label>
            <Input
              id="occurredAt"
              name="occurredAt"
              type="date"
              defaultValue={invoice?.occurred_at ?? today()}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">Adjunto (imagen o PDF)</Label>
            <Input id="file" name="file" type="file" accept=".pdf,image/png,image/jpeg,image/webp" />
            {invoice?.file_path && (
              <p className="text-xs text-brand-muted">
                Ya tiene un archivo adjunto. Sube uno nuevo solo si quieres reemplazarlo.
              </p>
            )}
          </div>

          {!invoice && warnNoEdit && (
            <p className="rounded-[var(--radius-brand-sm)] bg-amber-50 p-2 text-xs text-amber-800">
              Una vez guardada, esta factura no podrás editarla ni eliminarla. Verifica los datos
              antes de continuar.
            </p>
          )}

          {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
