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
import type { Movement, MovementType } from "@/lib/supabase/types";

interface MovementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement?: Movement;
  defaultType?: MovementType;
  action: (prev: { error?: string } | void, formData: FormData) => Promise<{ error?: string } | void>;
}

const today = () => new Date().toISOString().slice(0, 10);

export function MovementFormDialog({
  open,
  onOpenChange,
  movement,
  defaultType = "venta",
  action,
}: MovementFormDialogProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = React.useState<MovementType>(movement?.type ?? defaultType);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (open) setType(movement?.type ?? defaultType);
  }, [open, movement, defaultType]);

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
          <DialogTitle>{movement ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />

          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === "venta" ? "default" : "outline"}
              className="flex-1"
              onClick={() => setType("venta")}
            >
              Venta
            </Button>
            <Button
              type="button"
              variant={type === "gasto" ? "destructive" : "outline"}
              className="flex-1"
              onClick={() => setType("gasto")}
            >
              Gasto
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={movement?.amount}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="occurredAt">Fecha</Label>
            <Input
              id="occurredAt"
              name="occurredAt"
              type="date"
              defaultValue={movement?.occurred_at ?? today()}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" defaultValue={movement?.description ?? ""} />
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
