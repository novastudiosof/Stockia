"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
import { adjustStock } from "@/lib/actions/catalogo";
import type { Product } from "@/lib/supabase/types";

interface StockAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  categoryId: string;
}

export function StockAdjustDialog({
  open,
  onOpenChange,
  product,
  categoryId,
}: StockAdjustDialogProps) {
  const router = useRouter();
  const [delta, setDelta] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDelta("");
      setReason("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!product) return;

    const parsedDelta = Number(delta);
    if (!parsedDelta || Number.isNaN(parsedDelta)) {
      setError("Ingresa una cantidad distinta de cero (ej: 10 o -3)");
      return;
    }

    setPending(true);
    setError(null);
    const result = await adjustStock(product.id, categoryId, parsedDelta, reason);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar stock{product ? ` · ${product.name}` : ""}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-brand-muted">
            Stock actual: <strong className="text-brand-ink">{product?.quantity ?? 0}</strong>
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="delta">Cantidad a sumar o restar</Label>
            <Input
              id="delta"
              type="number"
              placeholder="Ej: 10 para sumar, -3 para restar"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Motivo</Label>
            <Input
              id="reason"
              placeholder="Ej: conteo físico, producto dañado, compra a proveedor"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-brand-danger">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
