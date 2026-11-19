"use client";

import * as React from "react";
import { useActionState } from "react";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Supplier } from "@/lib/supabase/types";

type Result = { error?: string; success?: string; id?: string };

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier;
  action: (prev: Result | void, formData: FormData) => Promise<Result>;
  /** Se llama al guardar con éxito (con el id si se creó uno nuevo). */
  onSaved?: (result: Result) => void;
}

export function SupplierFormDialog({ open, onOpenChange, supplier, action, onSaved }: SupplierFormDialogProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);
  const onSavedRef = React.useRef(onSaved);
  React.useEffect(() => {
    onSavedRef.current = onSaved;
  });

  React.useEffect(() => {
    if (state && !state.error) {
      onSavedRef.current?.(state);
      onOpenChange(false);
      formRef.current?.reset();
    }
  }, [state, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-nombre">Nombre o razón social</Label>
            <Input id="supplier-nombre" name="nombre" defaultValue={supplier?.nombre} required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-nit">NIT</Label>
              <Input id="supplier-nit" name="nit" defaultValue={supplier?.nit ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-telefono">Teléfono</Label>
              <Input id="supplier-telefono" name="telefono" defaultValue={supplier?.telefono ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-email">Correo</Label>
            <Input id="supplier-email" name="email" defaultValue={supplier?.email ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-direccion">Dirección</Label>
            <Input id="supplier-direccion" name="direccion" defaultValue={supplier?.direccion ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier-notas">Notas (opcional)</Label>
            <Input
              id="supplier-notas"
              name="notas"
              placeholder="Ej: día de visita, vendedor, condiciones"
              defaultValue={supplier?.notas ?? ""}
            />
          </div>

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
