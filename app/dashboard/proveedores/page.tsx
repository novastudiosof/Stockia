import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { SuppliersTable } from "@/components/compras/suppliers-table";
import type { Supplier } from "@/lib/supabase/types";

export default async function ProveedoresPage() {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.COMPRAS);

  const supabase = await createClient();
  const [{ data: suppliers }, { data: payables }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("nombre", { ascending: true }),
    supabase
      .from("purchases")
      .select("supplier_id, balance")
      .eq("organization_id", profile.organization_id)
      .is("voided_at", null)
      .gt("balance", 0),
  ]);

  const debts: Record<string, number> = {};
  for (const p of (payables as { supplier_id: string | null; balance: number }[] | null) ?? []) {
    if (p.supplier_id) debts[p.supplier_id] = (debts[p.supplier_id] ?? 0) + Number(p.balance);
  }

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
        <h1 className="text-2xl font-semibold text-brand-ink">Proveedores</h1>
        <p className="text-sm text-brand-muted">A quién le compras la mercancía y cuánto le debes.</p>
      </div>
      <SuppliersTable suppliers={(suppliers as Supplier[]) ?? []} debts={debts} />
    </div>
  );
}
