import Link from "next/link";
import { Plus, Truck } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import { monthStartBogota, todayBogota } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PurchasesTable } from "@/components/compras/purchases-table";
import { ExportPurchases } from "@/components/compras/export-purchases";
import type { Purchase } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default async function ComprasPage() {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.COMPRAS);

  const supabase = await createClient();
  const today = todayBogota();
  const [{ data: recent, error }, { data: payables }, { data: month }] = await Promise.all([
    supabase
      .from("purchases")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("purchases")
      .select("balance, due_date")
      .eq("organization_id", profile.organization_id)
      .is("voided_at", null)
      .gt("balance", 0),
    supabase
      .from("purchases")
      .select("total")
      .eq("organization_id", profile.organization_id)
      .is("voided_at", null)
      .gte("purchase_date", monthStartBogota()),
  ]);

  const pending = (payables as { balance: number; due_date: string | null }[] | null) ?? [];
  const payable = pending.reduce((sum, p) => sum + Number(p.balance), 0);
  const overdue = pending
    .filter((p) => p.due_date && p.due_date < today)
    .reduce((sum, p) => sum + Number(p.balance), 0);
  const monthTotal = ((month as { total: number }[] | null) ?? []).reduce((s, p) => s + Number(p.total), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Compras</h1>
          <p className="text-sm text-brand-muted">
            Registra la mercancía que llega: suma al inventario y actualiza el costo promedio de cada
            producto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/proveedores">
              <Truck className="h-4 w-4" />
              Proveedores
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/compras/nueva">
              <Plus className="h-4 w-4" />
              Nueva compra
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-brand-danger">
          {friendlyDbError(error, "ComprasPage", "No se pudieron cargar las compras", {
            PGRST205: "Falta ejecutar la migración 026 en Supabase",
            "42P01": "Falta ejecutar la migración 026 en Supabase",
          })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Por pagar a proveedores</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">{currency.format(payable)}</CardContent>
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
            <CardTitle className="text-sm font-medium text-brand-muted">Compras de este mes</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">{currency.format(monthTotal)}</CardContent>
        </Card>
      </div>

      <PurchasesTable purchases={(recent as Purchase[]) ?? []} today={today} />

      <div className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-brand-ink">Exportar compras</h2>
        <ExportPurchases defaultFrom={monthStartBogota()} defaultTo={today} />
      </div>

      <p className="text-xs text-brand-muted">
        Las compras no son gastos: su costo se descuenta en Utilidad cuando vendes el producto. Si
        antes registrabas la mercancía como gasto &quot;Compra de mercancía&quot;, ya no hace falta
        (se contaría dos veces).
      </p>
    </div>
  );
}
