"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { voidSale } from "@/lib/actions/ventas-productos";
import type { Sale } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

interface SalesHistoryProps {
  sales: Sale[];
  canVoid: boolean;
}

export function SalesHistory({ sales, canVoid }: SalesHistoryProps) {
  const router = useRouter();
  const [voiding, setVoiding] = React.useState<Sale | null>(null);
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleVoid() {
    if (!voiding) return;
    setIsVoiding(true);
    setError(null);
    const result = await voidSale(voiding.id);
    setIsVoiding(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setVoiding(null);
    router.refresh();
  }

  if (sales.length === 0) {
    return (
      <div className="rounded-[var(--radius-brand-md)] border border-dashed border-brand-border bg-white p-8 text-center text-sm text-brand-muted">
        Aún no has registrado ventas por este medio.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {sales.map((sale) => (
        <div
          key={sale.id}
          className={`rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-4 ${
            sale.voided_at ? "opacity-60" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-brand-muted">{dateTime.format(new Date(sale.created_at))}</p>
              {sale.voided_at && <Badge variant="danger">Anulada</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-brand-ink">{currency.format(sale.total)}</p>
              {canVoid && !sale.voided_at && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVoiding(sale)}
                  aria-label="Anular venta"
                >
                  <Ban className="h-4 w-4 text-brand-danger" />
                </Button>
              )}
            </div>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-brand-muted">
            {sale.items.map((item, idx) => (
              <li key={idx} className="flex justify-between">
                <span>
                  {item.quantity} × {item.name}
                </span>
                <span>{currency.format(item.subtotal)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {canVoid && (
        <ConfirmDialog
          open={!!voiding}
          onOpenChange={(open) => !open && setVoiding(null)}
          title="Anular venta"
          description={`¿Deseas anular esta venta por ${voiding ? currency.format(voiding.total) : ""}? El stock de los productos se devolverá al inventario. Esta acción no se puede deshacer.`}
          confirmLabel="Anular"
          loadingLabel="Anulando..."
          isLoading={isVoiding}
          onConfirm={handleVoid}
        />
      )}
      {error && <p className="text-sm text-brand-danger">{error}</p>}
    </div>
  );
}
