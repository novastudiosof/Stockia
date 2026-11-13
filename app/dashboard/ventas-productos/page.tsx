import { requireProfile } from "@/lib/auth";
import { getTaxSettings } from "@/lib/org-tax";
import { isModuleEnabled, requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { SaleCart } from "@/components/ventas-productos/sale-cart";
import { listSaleDrafts } from "@/lib/actions/borradores";
import { SalesHistory } from "@/components/ventas-productos/sales-history";
import type { Product, Sale } from "@/lib/supabase/types";

export default async function VentasProductosPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const clientesEnabled = await isModuleEnabled(profile.organization_id, MODULE_KEYS.CLIENTES);

  const supabase = await createClient();

  const [{ data: products }, { data: categories }, { data: sales }, drafts, { data: team }, taxSettings] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    supabase
      .from("sales")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(20),
    listSaleDrafts(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", profile.organization_id)
      .order("full_name", { ascending: true }),
    getTaxSettings(profile.organization_id),
  ]);
  const teammates = (team as { id: string; full_name: string }[]) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Ventas por Productos</h1>
        <p className="text-sm text-brand-muted">
          Selecciona los productos que compra el cliente; al confirmar se descuenta del inventario.
        </p>
      </div>

      <SaleCart
        products={(products as Product[]) ?? []}
        categories={(categories as { id: string; name: string }[]) ?? []}
        clientesEnabled={clientesEnabled}
        initialDrafts={drafts}
        currentUserId={profile.id}
        isAdmin={profile.role === "owner"}
        teammates={teammates}
        taxSettings={taxSettings}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-brand-ink">Ventas recientes</h2>
        <SalesHistory sales={(sales as Sale[]) ?? []} canVoid={profile.role === "owner"} />
      </div>
    </div>
  );
}
