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

export function SalesHistory({ sales }: { sales: Sale[] }) {
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
          className="rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-4"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-muted">{dateTime.format(new Date(sale.created_at))}</p>
            <p className="font-semibold text-brand-ink">{currency.format(sale.total)}</p>
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
    </div>
  );
}
