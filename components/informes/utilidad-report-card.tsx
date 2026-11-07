"use client";

import * as React from "react";
import { Loader2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getProfitReport, type ProfitReport } from "@/lib/actions/informes";
import { monthStartBogota, todayBogota } from "@/lib/dates";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const monthFormat = new Intl.DateTimeFormat("es-CO", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayFormat = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-brand-sm)] border border-brand-border p-3">
      <p className="text-xs text-brand-muted">{label}</p>
      <p
        className={`text-lg font-semibold ${
          tone === "good" ? "text-brand-success" : tone === "bad" ? "text-brand-danger" : "text-brand-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-brand-muted">{hint}</p>}
    </div>
  );
}

export function UtilidadReportCard() {
  const [from, setFrom] = React.useState(() => monthStartBogota());
  const [to, setTo] = React.useState(() => todayBogota());
  const [report, setReport] = React.useState<ProfitReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function handleCalculate() {
    setLoading(true);
    setError(null);
    try {
      const result = await getProfitReport(from, to);
      if ("error" in result && !("summary" in result)) {
        setError(result.error ?? "No se pudo calcular");
        setReport(null);
      } else {
        setReport(result as ProfitReport);
      }
    } catch {
      setError("No se pudo calcular la utilidad");
    } finally {
      setLoading(false);
    }
  }

  const s = report?.summary;
  const net = s ? s.gross_profit + s.manual_sales - s.expenses : 0;
  const margin = s && s.revenue > 0 ? (s.gross_profit / s.revenue) * 100 : 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Utilidad (ganancia)</CardTitle>
        <CardDescription>
          Cuánto ganaste: lo que vendiste menos lo que te costó comprarlo. Los gastos se ven aparte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profitFrom">Desde</Label>
            <Input id="profitFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profitTo">Hasta</Label>
            <Input id="profitTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="button" onClick={handleCalculate} disabled={loading || !from || !to}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Calcular ganancia
          </Button>
        </div>

        {error && <p className="text-sm text-brand-danger">{error}</p>}

        {report && s && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Kpi label="Vendido (sin anuladas)" value={currency.format(s.revenue)} hint={`${s.sales_count} ventas`} />
              <Kpi label="Costo de compra de lo vendido" value={currency.format(s.cost)} />
              <Kpi
                label="Ganancia"
                value={currency.format(s.gross_profit)}
                tone={s.gross_profit >= 0 ? "good" : "bad"}
                hint={`Vendido − costo · margen ${margin.toFixed(1)}%`}
              />
            </div>

            <details className="rounded-[var(--radius-brand-sm)] border border-brand-border p-3 text-sm">
              <summary className="cursor-pointer font-medium text-brand-ink">
                ¿Y si descuento gastos? (ganancia después de gastos)
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Kpi label="Ganancia de productos" value={currency.format(s.gross_profit)} />
                <Kpi label="Ventas manuales" value={currency.format(s.manual_sales)} />
                <Kpi label="Gastos" value={currency.format(s.expenses)} />
                <Kpi
                  label="Ganancia después de gastos"
                  value={currency.format(net)}
                  tone={net >= 0 ? "good" : "bad"}
                />
              </div>
            </details>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-brand-ink">
                  Productos que más ganancia dejan
                </p>
                {report.byProduct.length === 0 ? (
                  <p className="text-sm text-brand-muted">Sin ventas en este rango.</p>
                ) : (
                  <div className="overflow-x-auto rounded-[var(--radius-brand-sm)] border border-brand-border">
                    <table className="w-full text-sm">
                      <thead className="bg-black/5 text-left text-xs text-brand-muted">
                        <tr>
                          <th className="p-2 font-medium">Producto</th>
                          <th className="p-2 text-right font-medium">Unid.</th>
                          <th className="p-2 text-right font-medium">Ventas</th>
                          <th className="p-2 text-right font-medium">Utilidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {report.byProduct.map((p) => (
                          <tr key={p.product_id ?? p.name}>
                            <td className="max-w-[180px] truncate p-2">{p.name}</td>
                            <td className="p-2 text-right">{p.units}</td>
                            <td className="p-2 text-right">{currency.format(p.revenue)}</td>
                            <td
                              className={`p-2 text-right font-medium ${
                                p.profit >= 0 ? "text-brand-success" : "text-brand-danger"
                              }`}
                            >
                              {currency.format(p.profit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-brand-ink">
                  Utilidad por {report.group === "month" ? "mes" : "día"}
                </p>
                {report.byPeriod.length === 0 ? (
                  <p className="text-sm text-brand-muted">Sin ventas en este rango.</p>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-[var(--radius-brand-sm)] border border-brand-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-black/5 text-left text-xs text-brand-muted backdrop-blur">
                        <tr>
                          <th className="p-2 font-medium capitalize">
                            {report.group === "month" ? "Mes" : "Día"}
                          </th>
                          <th className="p-2 text-right font-medium">Ventas</th>
                          <th className="p-2 text-right font-medium">Utilidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border">
                        {report.byPeriod.map((row) => {
                          const date = new Date(`${row.period}T00:00:00Z`);
                          return (
                            <tr key={row.period}>
                              <td className="p-2 capitalize">
                                {report.group === "month"
                                  ? monthFormat.format(date)
                                  : dayFormat.format(date)}
                              </td>
                              <td className="p-2 text-right">{currency.format(row.revenue)}</td>
                              <td
                                className={`p-2 text-right font-medium ${
                                  row.profit >= 0 ? "text-brand-success" : "text-brand-danger"
                                }`}
                              >
                                {currency.format(row.profit)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-brand-muted">
              El costo se congela al vender (precio de compra de ese momento). En las ventas
              anteriores a esta función se estimó con el precio de compra actual. Las ventas
              manuales no tienen costo asociado: se cuentan completas como ingreso.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
