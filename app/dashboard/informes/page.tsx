import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VentasReportCard } from "@/components/informes/ventas-report-card";
import { InventarioReportCard } from "@/components/informes/inventario-report-card";

const LOW_STOCK_THRESHOLD = 10;

export default async function InformesPage() {
  const profile = await requireRole("owner");

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("quantity")
    .eq("organization_id", profile.organization_id);

  const totalProductos = products?.length ?? 0;
  const productosStockBajo =
    products?.filter((p) => p.quantity <= LOW_STOCK_THRESHOLD).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Informes</h1>
        <p className="text-sm text-brand-muted">
          Descarga reportes en Excel de tu negocio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VentasReportCard />
        <InventarioReportCard
          totalProductos={totalProductos}
          productosStockBajo={productosStockBajo}
        />
      </div>
    </div>
  );
}
