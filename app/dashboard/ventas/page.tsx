import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { MovementsView } from "@/components/ventas/movements-view";
import type { Movement } from "@/lib/supabase/types";

export default async function VentasPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);

  const supabase = await createClient();
  const { data: movements } = await supabase
    .from("movements")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("occurred_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Ventas y Gastos</h1>
        <p className="text-sm text-brand-muted">
          Controla tus movimientos de dinero por rango de fechas.
        </p>
      </div>
      <MovementsView
        movements={(movements as Movement[]) ?? []}
        canEdit={profile.role === "owner"}
      />
    </div>
  );
}
