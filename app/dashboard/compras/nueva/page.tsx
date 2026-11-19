import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { todayBogota } from "@/lib/dates";
import { getTaxSettings } from "@/lib/org-tax";
import { PurchaseForm, type PurchaseProduct } from "@/components/compras/purchase-form";
import type { Supplier } from "@/lib/supabase/types";

export default async function NuevaCompraPage() {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.COMPRAS);

  const supabase = await createClient();
  const [{ data: products }, { data: suppliers }, { data: categories }, taxSettings] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, barcode, quantity, purchase_price, sale_price")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("nombre", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, icon")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    getTaxSettings(profile.organization_id),
  ]);

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
        <h1 className="text-2xl font-semibold text-brand-ink">Nueva compra</h1>
        <p className="text-sm text-brand-muted">
          Lo que registres aquí entra al inventario y actualiza el costo de cada producto.
        </p>
      </div>
      <PurchaseForm
        products={((products as PurchaseProduct[] | null) ?? []).map((p) => ({
          ...p,
          purchase_price: Number(p.purchase_price),
          sale_price: Number(p.sale_price),
        }))}
        suppliers={(suppliers as Supplier[]) ?? []}
        categories={(categories as { id: string; name: string; icon: string }[] | null) ?? []}
        taxSettings={taxSettings}
        today={todayBogota()}
      />
    </div>
  );
}
