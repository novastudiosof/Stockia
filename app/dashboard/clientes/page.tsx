import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { ClientesTable } from "@/components/clientes/clientes-table";
import type { Cliente } from "@/lib/supabase/types";

export default async function ClientesPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const { data: clientes } = await supabase
    .from("clientes")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("nombre", { ascending: true });

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
      />
    </div>
  );
}
