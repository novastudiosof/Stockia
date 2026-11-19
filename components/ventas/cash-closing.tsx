"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { closeCashDay, reopenCashDay, saveCashBase } from "@/lib/actions/caja";
import type { CashDay, CashDaySummary } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface CashClosingProps {
  day: string;
  today: string;
  cashDay: CashDay | null;
  live: CashDaySummary;
  salesEnabled: boolean;
  /** Nombre del medio de pago "Otro" del negocio. */
  otherLabel?: string;
}

function Line({
  label,
  value,
  sign,
  strong,
}: {
  label: string;
  value: number;
  sign?: "+" | "-";
  strong?: boolean;
}) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? "font-semibold text-brand-ink" : ""}`}>
      <span className={strong ? "" : "text-brand-muted"}>{label}</span>
      <span>
        {sign === "-" ? "− " : sign === "+" ? "+ " : ""}
        {currency.format(value)}
      </span>
    </div>
  );
}

export function CashClosing({
  day,
  today,
  cashDay,
  live,
  salesEnabled,
  otherLabel = "Otro",
}: CashClosingProps) {
  const router = useRouter();
  const closed = !!cashDay?.closed_at;

  // Un día cerrado muestra la foto guardada al cerrar; uno abierto, las cifras en vivo.
  const n = (value: number | null | undefined) => Number(value ?? 0);
  const figures = closed && cashDay
    ? {
        sales_cash: n(cashDay.sales_cash),
        sales_nequi: n(cashDay.sales_nequi),
        sales_daviplata: n(cashDay.sales_daviplata),
        sales_llave: n(cashDay.sales_llave),
        sales_tarjeta: n(cashDay.sales_tarjeta),
        sales_otro: n(cashDay.sales_otro),
        sales_credito: n(cashDay.sales_credito),
        manual_sales: n(cashDay.manual_sales),
        expenses: n(cashDay.expenses),
        returns_cash: n(cashDay.returns_cash),
        returns_nequi: n(cashDay.returns_nequi),
        returns_daviplata: n(cashDay.returns_daviplata),
        returns_llave: n(cashDay.returns_llave),
        returns_tarjeta: n(cashDay.returns_tarjeta),
        returns_otro: n(cashDay.returns_otro),
        returns_credito: n(cashDay.returns_credito),
        abonos_cash: n(cashDay.abonos_cash),
        abonos_nequi: n(cashDay.abonos_nequi),
        abonos_daviplata: n(cashDay.abonos_daviplata),
        abonos_llave: n(cashDay.abonos_llave),
        abonos_tarjeta: n(cashDay.abonos_tarjeta),
        abonos_otro: n(cashDay.abonos_otro),
        purchases_cash: n(cashDay.purchases_cash),
        supplier_payments_cash: n(cashDay.supplier_payments_cash),
      }
    : live;

  const [base, setBase] = React.useState(String(cashDay?.base_amount ?? 0));
  const [counted, setCounted] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const [confirmReopen, setConfirmReopen] = React.useState(false);

  React.useEffect(() => {
    setBase(String(cashDay?.base_amount ?? 0));
    setCounted("");
    setNotes("");
    setMessage(null);
  }, [day, cashDay]);

  const baseNumber = Number(base) || 0;
  const expected = closed && cashDay
    ? Number(cashDay.expected_cash)
    : baseNumber +
      figures.sales_cash -
      figures.returns_cash +
      figures.abonos_cash +
      figures.manual_sales -
      figures.expenses -
      figures.purchases_cash -
      figures.supplier_payments_cash;
  const countedNumber = counted === "" ? null : Number(counted);
  const difference = closed && cashDay
    ? Number(cashDay.difference ?? 0)
    : countedNumber === null
      ? null
      : countedNumber - expected;
  // Lo que no pasa por el efectivo, por medio de pago (solo los que tienen valor).
  const nonCash = (pick: (m: "nequi" | "daviplata" | "llave" | "tarjeta" | "otro") => number) =>
    (
      [
        ["Nequi", pick("nequi")],
        ["Daviplata", pick("daviplata")],
        ["Llave", pick("llave")],
        ["Tarjeta", pick("tarjeta")],
        [otherLabel, pick("otro")],
      ] as const
    ).filter(([, amount]) => amount > 0);
  const salesOther = nonCash((m) => figures[`sales_${m}`]);
  const returnsOther = nonCash((m) => figures[`returns_${m}`]);
  const abonosOther = nonCash((m) => figures[`abonos_${m}`]);
  const sum = (rows: readonly (readonly [string, number])[]) => rows.reduce((t, [, a]) => t + a, 0);
  const detail = (rows: readonly (readonly [string, number])[]) =>
    rows.map(([label, amount]) => `${label} ${currency.format(amount)}`).join(" · ");

  async function run(action: () => Promise<{ error?: string; success?: string }>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (result.error) setMessage({ type: "error", text: result.error });
    else if (result.success) setMessage({ type: "ok", text: result.success });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="day">Día</Label>
          <Input
            id="day"
            type="date"
            max={today}
            value={day}
            onChange={(event) => {
              if (event.target.value) router.push(`/dashboard/ventas/cierre?date=${event.target.value}`);
            }}
          />
        </div>
        {day !== today && (
          <Button variant="outline" asChild>
            <Link href="/dashboard/ventas/cierre">Hoy</Link>
          </Button>
        )}
        {closed ? (
          <Badge variant="success" className="mb-2 gap-1">
            <Lock className="h-3 w-3" />
            Cerrado
            {cashDay?.closed_by_name ? ` por ${cashDay.closed_by_name}` : ""}
          </Badge>
        ) : (
          <Badge variant="muted" className="mb-2 gap-1">
            <LockOpen className="h-3 w-3" />
            Abierto
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. Base de caja</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-brand-muted">
              Efectivo con el que empezó la caja este día (para dar cambio).
            </p>
            <div className="flex gap-2 sm:max-w-xs">
              <Input
                type="number"
                min={0}
                step="1"
                value={base}
                disabled={closed || busy}
                onChange={(event) => setBase(event.target.value)}
              />
              <Button
                variant="outline"
                disabled={closed || busy || baseNumber === Number(cashDay?.base_amount ?? 0)}
                onClick={() => run(() => saveCashBase(day, baseNumber))}
              >
                Guardar
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumen del día</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-brand-border text-sm">
            <Line label="Base de caja" value={closed && cashDay ? Number(cashDay.base_amount) : baseNumber} />
            {salesEnabled && (
              <Line label="Ventas en efectivo" value={figures.sales_cash} sign="+" />
            )}
            {salesEnabled && figures.returns_cash > 0 && (
              <Line label="Devoluciones en efectivo de hoy" value={figures.returns_cash} sign="-" />
            )}
            {figures.abonos_cash > 0 && (
              <Line label="Abonos de fiado en efectivo" value={figures.abonos_cash} sign="+" />
            )}
            <Line label="Ventas manuales (se cuentan como efectivo)" value={figures.manual_sales} sign="+" />
            <Line label="Gastos (se cuentan como efectivo)" value={figures.expenses} sign="-" />
            {figures.purchases_cash > 0 && (
              <Line label="Compras pagadas desde la caja" value={figures.purchases_cash} sign="-" />
            )}
            {figures.supplier_payments_cash > 0 && (
              <Line label="Pagos a proveedores desde la caja" value={figures.supplier_payments_cash} sign="-" />
            )}
            <Line label="Efectivo esperado en caja" value={expected} strong />
            {salesEnabled && (
              <div className="flex flex-col gap-2 pt-3 text-xs text-brand-muted">
                <div>
                  <p className="font-medium text-brand-ink">
                    Cobrado por otros medios (no entra al efectivo): {currency.format(sum(salesOther))}
                  </p>
                  {salesOther.length > 0 && <p>{detail(salesOther)}</p>}
                </div>
                {figures.sales_credito > 0 && (
                  <p>
                    <span className="font-medium text-brand-ink">Vendido fiado hoy:</span>{" "}
                    {currency.format(figures.sales_credito)} (no entra a la caja hasta que lo paguen)
                  </p>
                )}
                {abonosOther.length > 0 && (
                  <p>
                    <span className="font-medium text-brand-ink">Abonos por otros medios:</span>{" "}
                    {detail(abonosOther)}
                  </p>
                )}
                {returnsOther.length > 0 && (
                  <p>
                    <span className="font-medium text-brand-ink">
                      Devoluciones por otros medios (no salen del efectivo):
                    </span>{" "}
                    {detail(returnsOther)}
                  </p>
                )}
                {figures.returns_credito > 0 && (
                  <p>
                    <span className="font-medium text-brand-ink">Fiado cancelado por devoluciones:</span>{" "}
                    {currency.format(figures.returns_credito)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>2. Conteo y cierre</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {closed && cashDay ? (
            <>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-brand-muted">Efectivo contado</p>
                  <p className="text-lg font-semibold text-brand-ink">
                    {currency.format(Number(cashDay.counted_cash ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-brand-muted">Diferencia</p>
                  <p
                    className={`text-lg font-semibold ${
                      Number(cashDay.difference ?? 0) === 0
                        ? "text-brand-success"
                        : "text-brand-danger"
                    }`}
                  >
                    {currency.format(Number(cashDay.difference ?? 0))}
                  </p>
                </div>
                <div>
                  <p className="text-brand-muted">Cerrado</p>
                  <p className="font-medium text-brand-ink">
                    {cashDay.closed_at ? new Date(cashDay.closed_at).toLocaleString("es-CO") : "—"}
                  </p>
                </div>
              </div>
              {cashDay.notes && (
                <p className="text-sm text-brand-muted">Observaciones: {cashDay.notes}</p>
              )}
              <p className="text-xs text-brand-muted">
                Con la caja cerrada no se pueden anular ventas ni cambiar movimientos de este día.
                Si necesitas corregir algo, reábrela.
              </p>
              <Button
                variant="outline"
                className="self-start"
                disabled={busy}
                onClick={() => setConfirmReopen(true)}
              >
                <LockOpen className="h-4 w-4" />
                Reabrir caja
              </Button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="counted">Efectivo contado en caja</Label>
                  <Input
                    id="counted"
                    type="number"
                    min={0}
                    step="1"
                    placeholder="Lo que realmente hay en caja"
                    value={counted}
                    onChange={(event) => setCounted(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Diferencia</Label>
                  <p
                    className={`flex h-9 items-center text-lg font-semibold ${
                      difference === null
                        ? "text-brand-muted"
                        : difference === 0
                          ? "text-brand-success"
                          : "text-brand-danger"
                    }`}
                  >
                    {difference === null ? "—" : currency.format(difference)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Observaciones (opcional)</Label>
                <Input
                  id="notes"
                  maxLength={300}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <Button
                className="self-start"
                disabled={busy || countedNumber === null || countedNumber < 0}
                onClick={() => setConfirmClose(true)}
              >
                <Lock className="h-4 w-4" />
                Cerrar caja del día
              </Button>
            </>
          )}

          {message && (
            <p className={`text-sm ${message.type === "ok" ? "text-brand-success" : "text-brand-danger"}`}>
              {message.text}
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Cerrar la caja"
        description={`Se guardará el cierre del ${day} con las cifras actuales. Después no se podrán anular ventas ni cambiar movimientos de ese día, salvo que reabras la caja.`}
        confirmLabel="Cerrar caja"
        isLoading={busy}
        onConfirm={async () => {
          setConfirmClose(false);
          await run(() => closeCashDay(day, countedNumber ?? 0, notes));
        }}
      />
      <ConfirmDialog
        open={confirmReopen}
        onOpenChange={setConfirmReopen}
        title="Reabrir la caja"
        description="Se borrará el cierre guardado de este día y podrás modificarlo y volver a cerrarlo."
        confirmLabel="Reabrir"
        isLoading={busy}
        onConfirm={async () => {
          setConfirmReopen(false);
          await run(() => reopenCashDay(day));
        }}
      />
    </div>
  );
}
