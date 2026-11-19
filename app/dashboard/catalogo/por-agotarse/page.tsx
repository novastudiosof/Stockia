import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getCurrentOrganization, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStockSettings } from "@/lib/org-stock";
import { friendlyDbError } from "@/lib/db-errors";
import { LowStockList, type OrderSupplier } from "@/components/stock/low-stock-list";
import type { LowStockRow } from "@/lib/supabase/types";

export default async function PorAgotarsePage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  const isOwner = profile.role === "owner";

  const supabase = await createClient();
  const [settings, org, { data, error }, { data: suppliers }] = await Promise.all([
    getStockSettings(profile.organization_id),
    getCurrentOrganization(profile.organization_id),
    supabase.rpc("low_stock_products"),
    isOwner
      ? supabase.from("suppliers").select("id, nombre, telefono").eq("organization_id", profile.organization_id)
      : Promise.resolve({ data: [] }),
  ]);

  // Proveedor y costo son del administrador (RLS ya no se los entrega al
  // auxiliar; aquí se limpian igual por si acaso).
  const rows = ((data as LowStockRow[] | null) ?? []).map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    min_stock: Number(r.min_stock),
    last_unit_cost: isOwner && r.last_unit_cost != null ? Number(r.last_unit_cost) : null,
    last_supplier_id: isOwner ? r.last_supplier_id : null,
    last_supplier_name: isOwner ? r.last_supplier_name : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/catalogo"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Catálogo
        </Link>
        <h1 className="text-2xl font-semibold text-brand-ink">Por agotarse</h1>
        <p className="text-sm text-brand-muted">
          Productos en su stock mínimo o por debajo, y los agotados.
          {isOwner && " El mínimo general se cambia en Mi Cuenta y el de cada producto aquí o en el Catálogo."}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-brand-danger">
          {friendlyDbError(error, "PorAgotarsePage", "No se pudo cargar la lista", {
            PGRST202: "Falta ejecutar la migración 027 en Supabase",
            "42703": "Falta ejecutar la migración 027 en Supabase",
          })}
        </p>
      ) : !settings.alertsEnabled ? (
        <div className="empty-glow rounded-[var(--radius-brand-md)] p-10 text-center text-brand-muted">
          Las alertas de stock están apagadas.
          {isOwner ? " Puedes encenderlas en Mi Cuenta." : ""}
        </div>
      ) : (
        <LowStockList
          rows={rows}
          isOwner={isOwner}
          defaultMinStock={settings.defaultMinStock}
          suppliers={(suppliers as OrderSupplier[] | null) ?? []}
          orgName={org?.legal_name?.trim() || org?.name || ""}
        />
      )}
    </div>
  );
}
