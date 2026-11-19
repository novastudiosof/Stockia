import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { VentasReportCard } from "@/components/informes/ventas-report-card";
import { VentasProductosReportCard } from "@/components/informes/ventas-productos-report-card";
import { InventarioReportCard } from "@/components/informes/inventario-report-card";
import { UtilidadReportCard } from "@/components/informes/utilidad-report-card";

export default async function InformesPage() {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.INFORMES);

  const supabase = await createClient();
  const [{ count }, { data: lowStock }] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id),
    supabase.rpc("low_stock_count"),
  ]);

  const totalProductos = count ?? 0;
  const productosStockBajo = Number(lowStock ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Informes</h1>
        <p className="text-sm text-brand-muted">
          Consulta, calcula la utilidad y descarga reportes de tu negocio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UtilidadReportCard />
        <VentasReportCard />
        <VentasProductosReportCard />
        <InventarioReportCard
          totalProductos={totalProductos}
          productosStockBajo={productosStockBajo}
        />
      </div>
    </div>
  );
}
