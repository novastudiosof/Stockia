import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getCurrentOrganization, requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { paymentSettingsOf } from "@/lib/payments";
import { todayBogota } from "@/lib/dates";
import { CustomerCartera, type CreditSaleRow } from "@/components/cartera/customer-cartera";
import type { Cliente, CustomerPayment, CustomerPaymentAllocation } from "@/lib/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CarteraClientePage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  if (!UUID_RE.test(clienteId)) notFound();

  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const supabase = await createClient();
  const [{ data: cliente }, { data: sales }, { data: payments }, org] = await Promise.all([
    supabase
      .from("clientes")
      .select("*")
      .eq("id", clienteId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("sales")
      .select(
        "id, sale_number, created_at, total, pay_credito, credit_balance, credit_due_date, voided_at, void_kind"
      )
      .eq("organization_id", profile.organization_id)
      .eq("customer_id", clienteId)
      .gt("pay_credito", 0)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("customer_payments")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("customer_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(200),
    getCurrentOrganization(profile.organization_id),
  ]);

  if (!cliente) notFound();

  const paymentRows = (payments as CustomerPayment[] | null) ?? [];
  const { data: allocations } =
    paymentRows.length > 0
      ? await supabase
          .from("customer_payment_allocations")
          .select("*")
          .in(
            "payment_id",
            paymentRows.map((p) => p.id)
          )
      : { data: [] };

  const prefix = org?.invoice_prefix ?? "";
  const saleRows: CreditSaleRow[] = ((sales as CreditSaleRow[] | null) ?? []).map((s) => ({
    ...s,
    total: Number(s.total),
    pay_credito: Number(s.pay_credito),
    credit_balance: Number(s.credit_balance),
  }));
  const saleLabel = Object.fromEntries(
    saleRows.map((s) => [s.id, s.sale_number ? `${prefix}${s.sale_number}` : s.id.slice(0, 8)])
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/cartera"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Cartera
        </Link>
        <h1 className="text-2xl font-semibold text-brand-ink">{(cliente as Cliente).nombre}</h1>
        <p className="text-sm text-brand-muted">
          {[(cliente as Cliente).documento, (cliente as Cliente).telefono].filter(Boolean).join(" · ") ||
            "Sin documento ni teléfono"}
        </p>
      </div>

      <CustomerCartera
        cliente={cliente as Cliente}
        sales={saleRows}
        saleLabel={saleLabel}
        payments={paymentRows.map((p) => ({ ...p, amount: Number(p.amount) }))}
        allocations={((allocations as CustomerPaymentAllocation[] | null) ?? []).map((a) => ({
          ...a,
          amount: Number(a.amount),
        }))}
        paymentSettings={paymentSettingsOf(org)}
        orgName={org?.legal_name?.trim() || org?.name || "tu tienda"}
        isAdmin={profile.role === "owner"}
        today={todayBogota()}
      />
    </div>
  );
}
