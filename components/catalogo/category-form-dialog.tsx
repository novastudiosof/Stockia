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
import type { Category } from "@/lib/supabase/types";

const ICON_OPTIONS = ["🛠️", "🔩", "🪛", "🎨", "🧱", "🚰", "💡", "🧰", "📦", "🍞", "🥐", "🧁"];
const COLOR_OPTIONS = [
  "#F59E0B",
  "#2563EB",
  "#16A34A",
  "#C0392B",
  "#7C3AED",
  "#0891B2",
];

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  action: (prev: { error?: string } | void, formData: FormData) => Promise<{ error?: string } | void>;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  action,
}: CategoryFormDialogProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [icon, setIcon] = React.useState(category?.icon ?? ICON_OPTIONS[0]);
  const [color, setColor] = React.useState(category?.color ?? COLOR_OPTIONS[0]);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (open) {
      setIcon(category?.icon ?? ICON_OPTIONS[0]);
      setColor(category?.color ?? COLOR_OPTIONS[0]);
    }
  }, [open, category]);

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
          <DialogTitle>{category ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="icon" value={icon} />
          <input type="hidden" name="color" value={color} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" defaultValue={category?.name} required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Ícono</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setIcon(option)}
                  className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-brand-sm)] border text-lg ${
                    icon === option ? "border-brand ring-2 ring-brand" : "border-brand-border"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option }}
                  className={`h-8 w-8 rounded-full border-2 ${
                    color === option ? "border-brand-ink" : "border-transparent"
                  }`}
                />
              ))}
            </div>
          </div>

          {state?.error && (
            <p className="text-sm text-brand-danger">{state.error}</p>
          )}

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
