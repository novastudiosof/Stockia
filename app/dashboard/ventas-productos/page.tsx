import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { SaleCart } from "@/components/ventas-productos/sale-cart";
import { SalesHistory } from "@/components/ventas-productos/sales-history";
import type { Product, Sale } from "@/lib/supabase/types";

export default async function VentasProductosPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();

  const [{ data: products }, { data: sales }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    supabase
      .from("sales")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Ventas por Productos</h1>
        <p className="text-sm text-brand-muted">
          Selecciona los productos que compra el cliente; al confirmar se descuenta del inventario.
        </p>
      </div>

      <SaleCart products={(products as Product[]) ?? []} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-brand-ink">Ventas recientes</h2>
        <SalesHistory sales={(sales as Sale[]) ?? []} canVoid={profile.role === "owner"} />
      </div>
    </div>
  );
}
