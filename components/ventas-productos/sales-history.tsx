"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ban, Printer, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { voidSale, searchSales } from "@/lib/actions/ventas-productos";
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

  const [query, setQuery] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [filtering, setFiltering] = React.useState(false);
  const [filteredSales, setFilteredSales] = React.useState<Sale[] | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const hasFilters = query.trim() !== "" || from !== "" || to !== "";
  const displayedSales = filteredSales ?? sales;

  React.useEffect(() => {
    if (!hasFilters) {
      setFilteredSales(null);
      setSearchError(null);
      return;
    }
    setFiltering(true);
    const timeout = setTimeout(async () => {
      const { results, error: fetchError } = await searchSales({ query, from, to });
      setFilteredSales(results);
      setSearchError(fetchError ?? null);
      setFiltering(false);
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, from, to]);

  function clearFilters() {
    setQuery("");
    setFrom("");
    setTo("");
    setFilteredSales(null);
    setSearchError(null);
  }

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar por cliente, documento o N.º de venta..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="sm:w-40"
          aria-label="Desde"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="sm:w-40"
          aria-label="Hasta"
        />
        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={clearFilters} aria-label="Limpiar filtros">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {filtering && <p className="text-sm text-brand-muted">Buscando...</p>}
      {searchError && <p className="text-sm text-brand-danger">{searchError}</p>}

      {displayedSales.length === 0 ? (
        <div className="rounded-[var(--radius-brand-md)] border border-dashed border-brand-border bg-white p-8 text-center text-sm text-brand-muted">
          {hasFilters
            ? "No hay ventas que coincidan con la búsqueda."
            : "Aún no has registrado ventas por este medio."}
        </div>
      ) : (
        displayedSales.map((sale) => (
          <div
            key={sale.id}
            className={`rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-4 ${
              sale.voided_at ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm text-brand-muted">
                  {sale.sale_number ? `#${sale.sale_number} · ` : ""}
                  {dateTime.format(new Date(sale.created_at))}
                </p>
                {sale.voided_at && <Badge variant="danger">Anulada</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-brand-ink">{currency.format(sale.total)}</p>
                <Button variant="ghost" size="icon" asChild aria-label="Imprimir factura">
                  <Link href={`/dashboard/ventas-productos/${sale.id}/factura`} target="_blank">
                    <Printer className="h-4 w-4" />
                  </Link>
                </Button>
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
            {sale.customer_snapshot && (
              <p className="mt-1 text-xs text-brand-muted">
                Cliente: {sale.customer_snapshot.nombre}
              </p>
            )}
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
        ))
      )}

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
