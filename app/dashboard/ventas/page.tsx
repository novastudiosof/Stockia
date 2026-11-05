import { requireRole } from "@/lib/auth";
import { isModuleEnabled, requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { MovementsView } from "@/components/ventas/movements-view";
import type { DailySales, Movement, MovementConcept } from "@/lib/supabase/types";

export default async function VentasPage() {
  // Los auxiliares solo venden desde "Ventas por Productos"; el control de
  // ventas, gastos y caja es del administrador.
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const supabase = await createClient();
  const salesEnabled = await isModuleEnabled(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const [{ data: movements }, { data: concepts }, dailySales] = await Promise.all([
    supabase
      .from("movements")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("movement_concepts")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("name", { ascending: true }),
    // Si Ventas por Productos no está contratado, no hay ventas que integrar.
    salesEnabled ? supabase.rpc("daily_sales") : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Ventas y Gastos</h1>
        <p className="text-sm text-brand-muted">
          Controla tus movimientos de dinero por rango de fechas.
          {salesEnabled &&
            " Las ventas hechas desde Ventas por Productos aparecen solas como \"Ventas registradas\"."}
        </p>
      </div>
      <MovementsView
        movements={(movements as Movement[]) ?? []}
        dailySales={((dailySales.data as DailySales[] | null) ?? []).map((d) => ({
          ...d,
          total: Number(d.total),
        }))}
        concepts={(concepts as MovementConcept[]) ?? []}
        canEdit
      />
    </div>
  );
}
