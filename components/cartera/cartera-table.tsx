"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDueDate } from "@/lib/payments";
import type { CarteraRow } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function Amount({ value, danger }: { value: number; danger?: boolean }) {
  if (!value) return <span className="text-brand-muted">—</span>;
  return <span className={danger ? "font-medium text-brand-danger" : ""}>{currency.format(value)}</span>;
}

export function CarteraTable({ rows }: { rows: CarteraRow[] }) {
  const [search, setSearch] = React.useState("");
  const [onlyOverdue, setOnlyOverdue] = React.useState(false);

  const term = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (!onlyOverdue || r.debt - r.current_amount > 0) &&
      (r.nombre.toLowerCase().includes(term) ||
        (r.documento ?? "").toLowerCase().includes(term) ||
        (r.telefono ?? "").toLowerCase().includes(term))
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-brand-ink">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={onlyOverdue}
            onChange={(event) => setOnlyOverdue(event.target.checked)}
          />
          Solo vencidos
        </label>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Cliente</th>
              <th className="p-3 font-medium">Debe</th>
              <th className="p-3 font-medium">Al día</th>
              <th className="p-3 font-medium">Vencido 1-30</th>
              <th className="p-3 font-medium">31-60</th>
              <th className="p-3 font-medium">61-90</th>
              <th className="p-3 font-medium">+90</th>
              <th className="p-3 font-medium">Vencimiento más antiguo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-brand-muted">
                  {rows.length === 0
                    ? "Nadie te debe. Las ventas fiadas aparecerán aquí."
                    : "No hay clientes que coincidan."}
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const overLimit = r.credit_limit !== null && r.debt > r.credit_limit;
              return (
                <tr key={r.customer_id} className="border-b border-brand-border last:border-0">
                  <td data-label="Cliente" className="p-3">
                    <Link
                      href={`/dashboard/cartera/${r.customer_id}`}
                      className="font-medium text-brand-ink underline-offset-2 hover:underline"
                    >
                      {r.nombre}
                    </Link>
                    <span className="block text-xs text-brand-muted">
                      {[r.documento, r.telefono].filter(Boolean).join(" · ") || "—"}
                      {" · "}
                      {r.sales_count} {r.sales_count === 1 ? "venta" : "ventas"}
                    </span>
                  </td>
                  <td data-label="Debe" className="p-3 font-semibold text-brand-ink">
                    {currency.format(r.debt)}
                    {overLimit && (
                      <Badge variant="danger" className="ml-2">
                        Supera cupo
                      </Badge>
                    )}
                  </td>
                  <td data-label="Al día" className="p-3">
                    <Amount value={r.current_amount} />
                  </td>
                  <td data-label="Vencido 1-30" className="p-3">
                    <Amount value={r.overdue_1_30} danger />
                  </td>
                  <td data-label="31-60" className="p-3">
                    <Amount value={r.overdue_31_60} danger />
                  </td>
                  <td data-label="61-90" className="p-3">
                    <Amount value={r.overdue_61_90} danger />
                  </td>
                  <td data-label="+90" className="p-3">
                    <Amount value={r.overdue_90} danger />
                  </td>
                  <td data-label="Vencimiento más antiguo" className="p-3 text-brand-muted">
                    {formatDueDate(r.oldest_due) ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
