import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { InvoicesTable } from "@/components/facturas/invoices-table";
import type { Invoice } from "@/lib/supabase/types";

export default async function FacturasPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("occurred_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Facturas</h1>
        <p className="text-sm text-brand-muted">
          Guarda las facturas de tus proveedores con su soporte adjunto.
        </p>
      </div>
      <InvoicesTable
        invoices={(invoices as Invoice[]) ?? []}
        canEdit={profile.role === "owner"}
      />
    </div>
  );
}
