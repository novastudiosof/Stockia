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
import type { Product } from "@/lib/supabase/types";

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product;
  action: (prev: { error?: string } | void, formData: FormData) => Promise<{ error?: string } | void>;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  action,
}: ProductFormDialogProps) {
  const formRef = React.useRef<HTMLFormElement>(null);

  // Las acciones devuelven undefined al guardar con éxito; por eso se cierra
  // el diálogo aquí, al terminar la acción sin error (antes nunca se cerraba).
  const wrappedAction = async (
    prev: { error?: string } | void,
    formData: FormData
  ) => {
    const result = await action(prev, formData);
    if (!result?.error) {
      onOpenChange(false);
      formRef.current?.reset();
    }
    return result;
  };

  const [state, formAction, pending] = useActionState(wrappedAction, undefined);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" defaultValue={product?.name} required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!product && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quantity">Cantidad inicial</Label>
                <Input id="quantity" name="quantity" type="number" min={0} defaultValue={0} required />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="purchasePrice">Precio de compra</Label>
              <Input
                id="purchasePrice"
                name="purchasePrice"
                type="number"
                min={0}
                step="0.01"
                defaultValue={product?.purchase_price ?? 0}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="salePrice">Precio de venta</Label>
              <Input
                id="salePrice"
                name="salePrice"
                type="number"
                min={0}
                step="0.01"
                defaultValue={product?.sale_price ?? 0}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input id="barcode" name="barcode" defaultValue={product?.barcode ?? ""} />
            </div>
          </div>

          {product && (
            <p className="text-xs text-brand-muted">
              Para cambiar la cantidad en stock usa &quot;Ajustar stock&quot; en la tabla — así
              queda registrado el motivo del cambio.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" defaultValue={product?.description ?? ""} />
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
