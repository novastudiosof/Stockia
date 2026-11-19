import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentOrganization, requireRole } from "@/lib/auth";
import { paymentSettingsOf } from "@/lib/payments";
import { isModuleEnabled, requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { CashClosing } from "@/components/ventas/cash-closing";
import type { CashDay, CashDaySummary } from "@/lib/supabase/types";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const SUMMARY_KEYS: (keyof CashDaySummary)[] = [
  "sales_count", "sales_total", "sales_cash", "sales_nequi", "sales_daviplata", "sales_llave",
  "sales_tarjeta", "sales_otro", "sales_credito", "manual_sales", "expenses",
  "returns_count", "returns_total", "returns_cash", "returns_nequi", "returns_daviplata",
  "returns_llave", "returns_tarjeta", "returns_otro", "returns_credito",
  "abonos_count", "abonos_total", "abonos_cash", "abonos_nequi", "abonos_daviplata",
  "abonos_llave", "abonos_tarjeta", "abonos_otro", "purchases_cash", "supplier_payments_cash",
];

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

  const [{ data: cashDay }, { data: summary }, org] = await Promise.all([
    supabase
      .from("cash_days")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("day", day)
      .maybeSingle(),
    supabase.rpc("cash_day_summary", { p_day: day }),
    getCurrentOrganization(profile.organization_id),
  ]);

  // Si falta alguna cifra (migración pendiente) queda en 0.
  const raw = ((summary as CashDaySummary[] | null)?.[0] ?? {}) as Partial<Record<keyof CashDaySummary, unknown>>;
  const live = Object.fromEntries(
    SUMMARY_KEYS.map((key) => [key, Number(raw[key] ?? 0)])
  ) as CashDaySummary;

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
        live={live}
        salesEnabled={salesEnabled}
        otherLabel={paymentSettingsOf(org).otherLabel}
      />
    </div>
  );
}
