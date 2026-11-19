"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDueDate } from "@/lib/payments";
import type { Purchase } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

type Filter = "todas" | "por_pagar" | "vencidas";

export function PurchaseStatus({ purchase, today }: { purchase: Purchase; today: string }) {
  if (purchase.voided_at) return <Badge variant="muted">Anulada</Badge>;
  if (purchase.payment_type === "contado") {
    return <Badge variant="success">{purchase.pay_source === "caja" ? "Pagada (caja)" : "Pagada"}</Badge>;
  }
  if (Number(purchase.balance) <= 0) return <Badge variant="success">Pagada</Badge>;
  const late = purchase.due_date && purchase.due_date < today;
  return <Badge variant={late ? "danger" : "outline"}>{late ? "Vencida" : "Por pagar"}</Badge>;
}

export function PurchasesTable({ purchases, today }: { purchases: Purchase[]; today: string }) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("todas");

  const term = search.trim().toLowerCase();
  const filtered = purchases.filter((p) => {
    const owes = !p.voided_at && Number(p.balance) > 0;
    if (filter === "por_pagar" && !owes) return false;
    if (filter === "vencidas" && !(owes && p.due_date && p.due_date < today)) return false;
    return (
      !term ||
      (p.supplier_name ?? "").toLowerCase().includes(term) ||
      (p.invoice_number ?? "").toLowerCase().includes(term) ||
      String(p.purchase_number) === term ||
      p.items.some((i) => i.name.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Proveedor, factura o producto..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-xs">
          {(
            [
              ["todas", "Todas"],
              ["por_pagar", "Por pagar"],
              ["vencidas", "Vencidas"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-[var(--radius-brand-sm)] px-3 py-1 ${
                filter === key ? "bg-brand text-brand-ink" : "text-brand-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Compra</th>
              <th className="p-3 font-medium">Proveedor</th>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Total</th>
              <th className="p-3 font-medium">Debe</th>
              <th className="p-3 font-medium">Vence</th>
              <th className="p-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-brand-muted">
                  {purchases.length === 0
                    ? "Aún no hay compras. Registra la primera con \"Nueva compra\"."
                    : "No hay compras que coincidan."}
                </td>
              </tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-brand-border last:border-0">
                <td data-label="Compra" className="p-3">
                  <Link
                    href={`/dashboard/compras/${p.id}`}
                    className="font-medium text-brand-ink underline-offset-2 hover:underline"
                  >
                    #{p.purchase_number}
                  </Link>
                  {p.invoice_number && (
                    <span className="block text-xs text-brand-muted">Fact. {p.invoice_number}</span>
                  )}
                </td>
                <td data-label="Proveedor" className="p-3">
                  {p.supplier_name ?? <span className="text-brand-muted">Sin proveedor</span>}
                  <span className="block text-xs text-brand-muted">
                    {p.items.length} {p.items.length === 1 ? "producto" : "productos"}
                  </span>
                </td>
                <td data-label="Fecha" className="p-3 text-brand-muted">{formatDueDate(p.purchase_date)}</td>
                <td data-label="Total" className="p-3 font-medium text-brand-ink">{currency.format(Number(p.total))}</td>
                <td data-label="Debe" className="p-3">
                  {!p.voided_at && Number(p.balance) > 0 ? currency.format(Number(p.balance)) : "—"}
                </td>
                <td data-label="Vence" className="p-3 text-brand-muted">
                  {p.payment_type === "credito" ? (formatDueDate(p.due_date) ?? "—") : "—"}
                </td>
                <td data-label="Estado" className="p-3">
                  <PurchaseStatus purchase={p} today={today} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
