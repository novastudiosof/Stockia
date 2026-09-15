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
import { bulkImportProducts, type BulkImportRowError } from "@/lib/actions/catalogo";

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkImportDialog({ open, onOpenChange }: BulkImportDialogProps) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rowErrors, setRowErrors] = React.useState<BulkImportRowError[] | null>(null);
  const [successCount, setSuccessCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (open) {
      setError(null);
      setRowErrors(null);
      setSuccessCount(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setRowErrors(null);
    setSuccessCount(null);

    const formData = new FormData(event.currentTarget);
    const result = await bulkImportProducts(formData);
    setPending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.rowErrors && result.rowErrors.length > 0) {
      setRowErrors(result.rowErrors);
      return;
    }
    setSuccessCount(result.insertedCount ?? 0);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar productos desde Excel</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-brand-muted">
            El archivo debe tener las columnas Categoría, Nombre, Cantidad, Precio compra, Precio
            venta, Descripción (opcional) y Código de barras (opcional). La categoría debe existir
            ya en tu catálogo.{" "}
            <a
              href="/api/reportes/plantilla-productos"
              className="font-medium text-brand-dark underline-offset-4 hover:underline"
            >
              Descargar plantilla
            </a>
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={fileRef}
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="text-sm text-brand-ink"
            />

            {error && <p className="text-sm text-brand-danger">{error}</p>}

            {rowErrors && (
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-brand-md)] border border-brand-danger/30 bg-brand-danger/5 p-3 text-sm">
                <p className="mb-1 font-medium text-brand-danger">
                  No se importó nada: corrige estas filas y vuelve a intentar.
                </p>
                <ul className="flex flex-col gap-1">
                  {rowErrors.map((rowError, idx) => (
                    <li key={idx} className="text-brand-danger">
                      Fila {rowError.row}: {rowError.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {successCount !== null && (
              <p className="text-sm text-brand-success">
                Se importaron {successCount} productos correctamente.
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Importando..." : "Importar"}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
