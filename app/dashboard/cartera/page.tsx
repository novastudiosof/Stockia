import Link from "next/link";
import { Download } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CarteraTable } from "@/components/cartera/cartera-table";
import type { CarteraRow } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function CarteraPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.CLIENTES);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cartera_resumen");
  const rows = ((data as CarteraRow[] | null) ?? []).map((r) => ({
    ...r,
    debt: Number(r.debt),
    current_amount: Number(r.current_amount),
    overdue_1_30: Number(r.overdue_1_30),
    overdue_31_60: Number(r.overdue_31_60),
    overdue_61_90: Number(r.overdue_61_90),
    overdue_90: Number(r.overdue_90),
    credit_limit: r.credit_limit == null ? null : Number(r.credit_limit),
  }));

  const total = rows.reduce((sum, r) => sum + r.debt, 0);
  const overdue = rows.reduce((sum, r) => sum + (r.debt - r.current_amount), 0);
  const overdueCustomers = rows.filter((r) => r.debt - r.current_amount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Cartera</h1>
          <p className="text-sm text-brand-muted">
            Lo que te deben tus clientes por ventas fiadas. Entra a un cliente para registrar abonos o
            recordarle por WhatsApp.
          </p>
        </div>
        {profile.role === "owner" && rows.length > 0 && (
          <Button variant="outline" asChild>
            <a href="/api/reportes/cartera">
              <Download className="h-4 w-4" />
              Descargar Excel
            </a>
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-brand-danger">
          {friendlyDbError(error, "CarteraPage", "No se pudo cargar la cartera", {
            PGRST202: "Falta ejecutar la migración 024 en Supabase",
            "42703": "Falta ejecutar la migración 024 en Supabase",
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Total por cobrar</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">
            {currency.format(total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Vencido</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-2xl font-semibold ${overdue > 0 ? "text-brand-danger" : "text-brand-success"}`}
          >
            {currency.format(overdue)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Clientes que deben</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">
            {rows.length}
            {overdueCustomers > 0 && (
              <span className="ml-2 text-sm font-normal text-brand-danger">
                ({overdueCustomers} con pagos vencidos)
              </span>
            )}
          </CardContent>
        </Card>
      </div>

      <CarteraTable rows={rows} />

      <p className="text-xs text-brand-muted">
        Para fiar, elige &quot;Fiado&quot; (o una parte en &quot;Mixto&quot;) al vender desde{" "}
        <Link href="/dashboard/ventas-productos" className="underline">
          Ventas por Productos
        </Link>
        . El cupo y el plazo de cada cliente se configuran en{" "}
        <Link href="/dashboard/clientes" className="underline">
          Clientes
        </Link>
        .
      </p>
    </div>
  );
}
