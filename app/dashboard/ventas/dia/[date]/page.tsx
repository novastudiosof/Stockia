import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import { requireRole } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { paymentLabel } from "@/lib/payments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Sale } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const time = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

function nextDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function DetalleDiaPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_GASTOS);
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  // Colombia no tiene horario de verano: el día local es siempre UTC-5.
  const { data } = await supabase
    .from("sales")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .gte("created_at", `${date}T00:00:00-05:00`)
    .lt("created_at", `${nextDay(date)}T00:00:00-05:00`)
    .order("created_at", { ascending: true });

  const sales = (data as Sale[]) ?? [];
  const active = sales.filter((s) => !s.voided_at);
  const total = active.reduce((sum, s) => sum + Number(s.total), 0);
  const byMethod = [
    { label: "Efectivo", amount: active.reduce((sum, s) => sum + Number(s.pay_cash), 0) },
    { label: "Nequi", amount: active.reduce((sum, s) => sum + Number(s.pay_nequi), 0) },
    { label: "Daviplata", amount: active.reduce((sum, s) => sum + Number(s.pay_daviplata), 0) },
    { label: "Llave", amount: active.reduce((sum, s) => sum + Number(s.pay_llave), 0) },
  ].filter((m) => m.amount > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/ventas"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Ventas y Gastos
        </Link>
        <h1 className="text-2xl font-semibold text-brand-ink">Ventas registradas · {date}</h1>
        <p className="text-sm text-brand-muted">
          Detalle de cada venta por productos del día. Desde aquí puedes reimprimir la factura.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Total del día</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-success">
            {currency.format(total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Ventas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">
            {active.length}
            {sales.length !== active.length && (
              <span className="ml-2 text-sm font-normal text-brand-muted">
                ({sales.length - active.length} anuladas)
              </span>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Por método de pago</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-0.5 text-sm">
            {byMethod.length === 0 && <span className="text-brand-muted">—</span>}
            {byMethod.map((m) => (
              <div key={m.label} className="flex justify-between">
                <span className="text-brand-muted">{m.label}</span>
                <span className="font-medium text-brand-ink">{currency.format(m.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">N°</th>
              <th className="p-3 font-medium">Hora</th>
              <th className="p-3 font-medium">Vendido por</th>
              <th className="p-3 font-medium">Cliente</th>
              <th className="p-3 font-medium">Pago</th>
              <th className="p-3 font-medium">Total</th>
              <th className="p-3 font-medium text-right">Factura</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-brand-muted">
                  No hay ventas registradas este día.
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr
                key={sale.id}
                className={`border-b border-brand-border last:border-0 ${sale.voided_at ? "opacity-60" : ""}`}
              >
                <td data-label="N°" className="p-3">{sale.sale_number ?? "—"}</td>
                <td data-label="Hora" className="p-3">{time.format(new Date(sale.created_at))}</td>
                <td data-label="Vendido por" className="p-3">{sale.sold_by_name ?? "—"}</td>
                <td data-label="Cliente" className="p-3">
                  <p className="text-brand-ink">
                    {sale.customer_snapshot?.nombre ?? "Consumidor final"}
                  </p>
                  {sale.customer_email && (
                    <p className="text-xs text-brand-muted">{sale.customer_email}</p>
                  )}
                </td>
                <td data-label="Pago" className="p-3">{paymentLabel(sale)}</td>
                <td data-label="Total" className="p-3 font-medium">
                  {currency.format(sale.total)}
                  {sale.voided_at && (
                    <Badge variant="danger" className="ml-2">
                      Anulada
                    </Badge>
                  )}
                </td>
                <td data-label="" className="p-3">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/ventas-productos/${sale.id}/factura`} target="_blank">
                        <Printer className="h-4 w-4" />
                        Ver / imprimir
                      </Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
