import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { isModuleEnabled, requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { CashClosing } from "@/components/ventas/cash-closing";
import type { CashDay, CashDaySummary } from "@/lib/supabase/types";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export default async function CierreCajaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const { date } = await searchParams;
  const today = todayBogota();
  const day = date && DAY_RE.test(date) && date <= today ? date : today;

  const supabase = await createClient();
  const salesEnabled = await isModuleEnabled(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const [{ data: cashDay }, { data: summary }] = await Promise.all([
    supabase
      .from("cash_days")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("day", day)
      .maybeSingle(),
    supabase.rpc("cash_day_summary", { p_day: day }),
  ]);

  const live = (summary as CashDaySummary[] | null)?.[0] ?? {
    sales_count: 0,
    sales_total: 0,
    sales_cash: 0,
    sales_nequi: 0,
    sales_daviplata: 0,
    sales_llave: 0,
    manual_sales: 0,
    expenses: 0,
    returns_count: 0,
    returns_total: 0,
    returns_cash: 0,
    returns_nequi: 0,
    returns_daviplata: 0,
    returns_llave: 0,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/ventas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Ventas y Gastos
        </Link>
        <h1 className="text-2xl font-semibold text-brand-ink">Cierre de caja</h1>
        <p className="text-sm text-brand-muted">
          Cuadra el efectivo del día: base inicial, ventas, gastos y lo que realmente hay en caja.
        </p>
      </div>

      <CashClosing
        day={day}
        today={today}
        cashDay={(cashDay as CashDay | null) ?? null}
        live={{
          sales_count: Number(live.sales_count),
          sales_total: Number(live.sales_total),
          sales_cash: Number(live.sales_cash),
          sales_nequi: Number(live.sales_nequi),
          sales_daviplata: Number(live.sales_daviplata),
          sales_llave: Number(live.sales_llave),
          manual_sales: Number(live.manual_sales),
          expenses: Number(live.expenses),
          returns_count: Number(live.returns_count),
          returns_total: Number(live.returns_total),
          returns_cash: Number(live.returns_cash),
          returns_nequi: Number(live.returns_nequi),
          returns_daviplata: Number(live.returns_daviplata),
          returns_llave: Number(live.returns_llave),
        }}
        salesEnabled={salesEnabled}
      />
    </div>
  );
}
