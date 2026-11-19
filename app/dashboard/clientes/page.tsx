import { getCurrentOrganization, requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { paymentSettingsOf } from "@/lib/payments";
import { ClientesTable } from "@/components/clientes/clientes-table";
import type { CarteraRow, Cliente } from "@/lib/supabase/types";

export default async function ClientesPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const supabase = await createClient();
  const [{ data: clientes }, { data: cartera }, org] = await Promise.all([
    supabase
      .from("clientes")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("nombre", { ascending: true }),
    // Si falta la migración 024 la consulta falla y simplemente no se muestra la deuda.
    supabase.rpc("cartera_resumen"),
    getCurrentOrganization(profile.organization_id),
  ]);

  const debts: Record<string, number> = {};
  for (const row of (cartera as CarteraRow[] | null) ?? []) {
    debts[row.customer_id] = Number(row.debt);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Clientes</h1>
        <p className="text-sm text-brand-muted">
          Se guardan automáticamente al vender desde &quot;Ventas por Productos&quot;. También
          puedes agregarlos o corregirlos aquí.
        </p>
      </div>

      <ClientesTable
        clientes={(clientes as Cliente[]) ?? []}
        canEdit={profile.role === "owner"}
        debts={debts}
        defaultCreditDays={paymentSettingsOf(org).defaultCreditDays}
      />
    </div>
  );
}
