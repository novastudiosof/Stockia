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
import { AttachmentPicker } from "@/components/attachment-picker";
import type { Movement, MovementConcept, MovementType } from "@/lib/supabase/types";

interface MovementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement?: Movement;
  defaultType?: MovementType;
  warnNoEdit?: boolean;
  concepts?: MovementConcept[];
  action: (prev: { error?: string } | void, formData: FormData) => Promise<{ error?: string } | void>;
}

// Fecha local (no UTC): cerca de la medianoche toISOString() daría el día siguiente.
const today = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
};

export function MovementFormDialog({
  open,
  onOpenChange,
  movement,
  defaultType = "venta",
  warnNoEdit = false,
  concepts = [],
  action,
}: MovementFormDialogProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [type, setType] = React.useState<MovementType>(movement?.type ?? defaultType);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [preparingFile, setPreparingFile] = React.useState(false);
  const typeConcepts = concepts.filter((c) => c.type === type);
  // Si el movimiento editado tiene un concepto que ya no está en la lista, se
  // conserva como opción para no perderlo al guardar.
  const currentConcept = movement?.type === type ? movement.concept : null;
  const conceptOptions =
    currentConcept && !typeConcepts.some((c) => c.name === currentConcept)
      ? [...typeConcepts.map((c) => c.name), currentConcept]
      : typeConcepts.map((c) => c.name);

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
            <Label htmlFor="concept">Concepto</Label>
            <select
              key={type}
              id="concept"
              name="concept"
              defaultValue={currentConcept ?? ""}
              className="h-9 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
            >
              <option value="">Sin concepto</option>
              {conceptOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="text-xs text-brand-muted">
              Puedes agregar o quitar conceptos desde Mi Cuenta.
            </p>
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

          {!movement && (
            <div className="flex flex-col gap-1.5">
              <Label>Archivo adjunto (opcional)</Label>
              <AttachmentPicker onBusyChange={setPreparingFile} />
            </div>
          )}

          {!movement && warnNoEdit && (
            <p className="rounded-[var(--radius-brand-sm)] bg-amber-50 p-2 text-xs text-amber-800">
              Una vez guardado, este movimiento no podrás editarlo ni eliminarlo. Verifica los datos
              antes de continuar.
            </p>
          )}

          {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || preparingFile}>
              {pending ? "Guardando..." : preparingFile ? "Preparando adjunto..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
