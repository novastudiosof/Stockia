"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, MessageCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setProductMinStock } from "@/lib/actions/stock";
import { normalizeWhatsappNumber } from "@/lib/invoice-client";
import { suggestedOrder } from "@/lib/stock";
import type { LowStockRow } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export type OrderSupplier = { id: string; nombre: string; telefono: string | null };

type Filter = "todos" | "agotados" | "bajos";

const NO_SUPPLIER = "__none__";

export function LowStockList({
  rows,
  isOwner,
  defaultMinStock,
  suppliers,
  orgName,
}: {
  rows: LowStockRow[];
  isOwner: boolean;
  defaultMinStock: number;
  suppliers: OrderSupplier[];
  orgName: string;
}) {
  const [filter, setFilter] = React.useState<Filter>("todos");
  const [search, setSearch] = React.useState("");

  const agotados = rows.filter((r) => r.quantity <= 0).length;
  const bajos = rows.length - agotados;

  const term = search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter === "agotados" && r.quantity > 0) return false;
    if (filter === "bajos" && r.quantity <= 0) return false;
    return !term || r.name.toLowerCase().includes(term) || (r.barcode ?? "").toLowerCase().includes(term);
  });

  if (rows.length === 0) {
    return (
      <div className="empty-glow rounded-[var(--radius-brand-md)] p-10 text-center text-brand-muted">
        Todo en orden: ningún producto está en su mínimo ni agotado.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white p-1 text-sm">
          {(
            [
              ["todos", `Todos (${rows.length})`],
              ["agotados", `Agotados (${agotados})`],
              ["bajos", `Por agotarse (${bajos})`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-[var(--radius-brand-sm)] px-3 py-1.5 ${
                filter === key ? "bg-brand text-brand-ink" : "text-brand-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Producto</th>
              <th className="p-3 font-medium">Stock</th>
              <th className="p-3 font-medium">Mínimo</th>
              <th className="p-3 font-medium">Estado</th>
              {isOwner && <th className="p-3 font-medium">Último proveedor</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isOwner ? 5 : 4} className="p-6 text-center text-brand-muted">
                  No hay productos que coincidan.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.product_id} className="border-b border-brand-border last:border-0">
                <td data-label="Producto" className="p-3">
                  <Link
                    href={`/dashboard/catalogo/${r.category_id}`}
                    className="font-medium text-brand-ink hover:underline"
                  >
                    {r.name}
                  </Link>
                  <span className="block text-xs text-brand-muted">
                    {r.category_icon} {r.category_name}
                    {r.barcode ? ` · ${r.barcode}` : ""}
                  </span>
                </td>
                <td data-label="Stock" className="p-3 font-medium">{r.quantity}</td>
                <td data-label="Mínimo" className="p-3">
                  {isOwner ? (
                    <MinStockEditor row={r} defaultMinStock={defaultMinStock} />
                  ) : (
                    <>
                      {r.min_stock}
                      {!r.own_min && <span className="text-xs text-brand-muted"> (general)</span>}
                    </>
                  )}
                </td>
                <td data-label="Estado" className="p-3">
                  {r.quantity <= 0 ? (
                    <Badge variant="danger">Agotado</Badge>
                  ) : (
                    <Badge variant="muted">Por agotarse</Badge>
                  )}
                </td>
                {isOwner && (
                  <td data-label="Último proveedor" className="p-3 text-brand-muted">
                    {r.last_supplier_name ?? "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isOwner && (
        <p className="text-xs text-brand-muted">Avísale al administrador para que haga el pedido.</p>
      )}

      {isOwner && <SuggestedOrder rows={rows} suppliers={suppliers} orgName={orgName} />}
    </div>
  );
}

function MinStockEditor({ row, defaultMinStock }: { row: LowStockRow; defaultMinStock: number }) {
  const router = useRouter();
  const initial = row.own_min ? String(row.min_stock) : "";
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = value !== initial;

  async function save() {
    setBusy(true);
    setError(null);
    const result = await setProductMinStock(row.product_id, value === "" ? null : value);
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          step="1"
          inputMode="numeric"
          className="h-9 w-24"
          placeholder={`General (${defaultMinStock})`}
          aria-label={`Stock mínimo de ${row.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) save();
          }}
        />
        {dirty && (
          <Button type="button" size="icon" variant="outline" disabled={busy} aria-label="Guardar mínimo" onClick={save}>
            <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </div>
  );
}

type OrderGroup = {
  key: string;
  name: string;
  phone: string | null;
  rows: LowStockRow[];
};

function SuggestedOrder({
  rows,
  suppliers,
  orgName,
}: {
  rows: LowStockRow[];
  suppliers: OrderSupplier[];
  orgName: string;
}) {
  const [quantities, setQuantities] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((r) => [r.product_id, String(suggestedOrder(r.quantity, r.min_stock))]))
  );
  const [copied, setCopied] = React.useState<string | null>(null);

  // Si la lista cambia (p. ej. se editó un mínimo), los productos nuevos toman su sugerido.
  React.useEffect(() => {
    setQuantities((prev) => {
      const next: Record<string, string> = {};
      for (const r of rows) next[r.product_id] = prev[r.product_id] ?? String(suggestedOrder(r.quantity, r.min_stock));
      return next;
    });
  }, [rows]);

  const groups = React.useMemo(() => {
    const byKey = new Map<string, OrderGroup>();
    for (const r of rows) {
      const key = r.last_supplier_id ?? NO_SUPPLIER;
      if (!byKey.has(key)) {
        const supplier = suppliers.find((s) => s.id === r.last_supplier_id);
        byKey.set(key, {
          key,
          name: supplier?.nombre ?? r.last_supplier_name ?? "Sin proveedor",
          phone: supplier?.telefono ?? null,
          rows: [],
        });
      }
      byKey.get(key)!.rows.push(r);
    }
    // Primero los proveedores (por nombre) y al final "Sin proveedor".
    return [...byKey.values()].sort((a, b) =>
      a.key === NO_SUPPLIER ? 1 : b.key === NO_SUPPLIER ? -1 : a.name.localeCompare(b.name, "es")
    );
  }, [rows, suppliers]);

  const qty = (id: string) => Math.max(Math.floor(Number(quantities[id]) || 0), 0);

  function orderText(group: OrderGroup) {
    const lines = group.rows.filter((r) => qty(r.product_id) > 0).map((r) => `- ${qty(r.product_id)} x ${r.name}`);
    return [
      group.key === NO_SUPPLIER ? "Pedido:" : `Hola ${group.name}, quiero hacer este pedido:`,
      ...lines,
      ...(orgName ? ["", orgName] : []),
    ].join("\n");
  }

  async function copy(group: OrderGroup) {
    try {
      await navigator.clipboard.writeText(orderText(group));
      setCopied(group.key);
      setTimeout(() => setCopied((c) => (c === group.key ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  }

  const payload = JSON.stringify(Object.fromEntries(rows.map((r) => [r.product_id, qty(r.product_id)])));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-brand-ink">Pedido sugerido</h2>
          <p className="text-sm text-brand-muted">
            Agrupado por el último proveedor al que le compraste cada producto. La cantidad sugerida
            es lo que falta para llegar al mínimo; cámbiala si quieres pedir más.
          </p>
        </div>
        <form method="POST" action="/api/reportes/pedido-sugerido">
          <input type="hidden" name="cantidades" value={payload} />
          <Button type="submit" variant="outline">
            <Download className="h-4 w-4" />
            Descargar Excel
          </Button>
        </form>
      </div>

      {groups.map((group) => {
        const total = group.rows.reduce((sum, r) => sum + qty(r.product_id) * (r.last_unit_cost ?? 0), 0);
        const hasCost = group.rows.some((r) => r.last_unit_cost != null);
        const phone = normalizeWhatsappNumber(group.phone);
        const anyQty = group.rows.some((r) => qty(r.product_id) > 0);
        return (
          <Card key={group.key}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{group.name}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={!anyQty} onClick={() => copy(group)}>
                  {copied === group.key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === group.key ? "Copiado" : "Copiar pedido"}
                </Button>
                {phone && anyQty && (
                  <Button type="button" size="sm" asChild>
                    <a
                      href={`https://wa.me/${phone}?text=${encodeURIComponent(orderText(group))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="overflow-x-auto">
                <table className="table-stack w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-brand-border text-left text-brand-muted">
                      <th className="p-2 font-medium">Producto</th>
                      <th className="p-2 font-medium">Stock / mínimo</th>
                      <th className="p-2 font-medium">Pedir</th>
                      <th className="p-2 font-medium">Último costo</th>
                      <th className="p-2 font-medium">Estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((r) => (
                      <tr key={r.product_id} className="border-b border-brand-border last:border-0">
                        <td data-label="Producto" className="p-2 font-medium text-brand-ink">{r.name}</td>
                        <td data-label="Stock / mínimo" className="p-2 text-brand-muted">
                          {r.quantity} / {r.min_stock}
                        </td>
                        <td data-label="Pedir" className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="1"
                            inputMode="numeric"
                            className="h-9 w-24"
                            aria-label={`Cantidad a pedir de ${r.name}`}
                            value={quantities[r.product_id] ?? ""}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [r.product_id]: e.target.value }))}
                          />
                        </td>
                        <td data-label="Último costo" className="p-2 text-brand-muted">
                          {r.last_unit_cost != null ? currency.format(r.last_unit_cost) : "—"}
                        </td>
                        <td data-label="Estimado" className="p-2">
                          {r.last_unit_cost != null ? currency.format(qty(r.product_id) * r.last_unit_cost) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasCost && (
                <p className="text-right text-sm font-medium text-brand-ink">
                  Estimado del pedido: {currency.format(total)}
                </p>
              )}
              {group.key !== NO_SUPPLIER && !phone && (
                <p className="text-xs text-brand-muted">
                  Para mandarlo por WhatsApp, agrega el celular del proveedor en Compras → Proveedores.
                </p>
              )}
              {group.key === NO_SUPPLIER && (
                <p className="text-xs text-brand-muted">
                  Estos productos aún no tienen compras registradas con proveedor.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
