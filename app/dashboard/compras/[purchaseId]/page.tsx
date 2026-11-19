import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { todayBogota } from "@/lib/dates";
import { PurchaseDetail } from "@/components/compras/purchase-detail";
import type { Purchase, SupplierPayment } from "@/lib/supabase/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ soporte?: string }>;
}) {
  const { purchaseId } = await params;
  const { soporte } = await searchParams;
  if (!UUID_RE.test(purchaseId)) notFound();

  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.COMPRAS);

  const supabase = await createClient();
  const [{ data: purchase }, { data: payments }] = await Promise.all([
    supabase
      .from("purchases")
      .select("*")
      .eq("id", purchaseId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle(),
    supabase
      .from("supplier_payments")
      .select("*")
      .eq("purchase_id", purchaseId)
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false }),
  ]);
  if (!purchase) notFound();

  const p = purchase as Purchase;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/compras"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Compras
        </Link>
        <h1 className="text-2xl font-semibold text-brand-ink">
          Compra #{p.purchase_number}
          {p.supplier_name ? ` · ${p.supplier_name}` : ""}
        </h1>
        <p className="text-sm text-brand-muted">
          {p.invoice_number ? `Factura ${p.invoice_number} · ` : ""}Registrada por {p.created_by_name ?? "—"}
        </p>
      </div>
      <PurchaseDetail
        purchase={{ ...p, total: Number(p.total), balance: Number(p.balance) }}
        payments={((payments as SupplierPayment[] | null) ?? []).map((x) => ({ ...x, amount: Number(x.amount) }))}
        today={todayBogota()}
        fileUploadFailed={soporte === "error"}
      />
    </div>
  );
}
