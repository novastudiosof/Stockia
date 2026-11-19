"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { registerAbono, voidAbono } from "@/lib/actions/cartera";
import { normalizeWhatsappNumber } from "@/lib/invoice-client";
import { formatDueDate, methodLabel, type PaymentSettings } from "@/lib/payments";
import type {
  AbonoMethod,
  Cliente,
  CustomerPayment,
  CustomerPaymentAllocation,
} from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export type CreditSaleRow = {
  id: string;
  sale_number: number | null;
  created_at: string;
  total: number;
  pay_credito: number;
  credit_balance: number;
  credit_due_date: string | null;
  voided_at: string | null;
  void_kind: "anulacion" | "devolucion" | null;
};

interface CustomerCarteraProps {
  cliente: Cliente;
  sales: CreditSaleRow[];
  /** Número de factura de cada venta (id -> "FAC-12"). */
  saleLabel: Record<string, string>;
  payments: CustomerPayment[];
  allocations: CustomerPaymentAllocation[];
  paymentSettings: PaymentSettings;
  orgName: string;
  isAdmin: boolean;
  /** Hoy en Colombia (YYYY-MM-DD). */
  today: string;
}

export function CustomerCartera({
  cliente,
  sales,
  saleLabel,
  payments,
  allocations,
  paymentSettings,
  orgName,
  isAdmin,
  today,
}: CustomerCarteraProps) {
  const router = useRouter();
  const methods: AbonoMethod[] = [
    "efectivo",
    ...paymentSettings.methods.filter((m): m is Exclude<AbonoMethod, "efectivo"> => m !== "credito"),
  ];

  const pending = sales.filter((s) => !s.voided_at && s.credit_balance > 0);
  const debt = pending.reduce((sum, s) => sum + s.credit_balance, 0);
  const overdue = pending
    .filter((s) => s.credit_due_date && s.credit_due_date < today)
    .reduce((sum, s) => sum + s.credit_balance, 0);
  const limit = cliente.credit_limit == null ? null : Number(cliente.credit_limit);

  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<AbonoMethod>("efectivo");
  const [saleId, setSaleId] = React.useState<string>("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [voiding, setVoiding] = React.useState<CustomerPayment | null>(null);
  const formRef = React.useRef<HTMLDivElement>(null);

  const selectedSale = pending.find((s) => s.id === saleId) ?? null;
  const maxAmount = selectedSale ? selectedSale.credit_balance : debt;

  async function handleAbono() {
    setBusy(true);
    setMessage(null);
    const result = await registerAbono({
      customerId: cliente.id,
      amount,
      method,
      saleId: saleId || undefined,
      notes,
    });
    setBusy(false);
    if (result.error) {
      setMessage({ type: "error", text: result.error });
      return;
    }
    setMessage({ type: "ok", text: `Abono de ${currency.format(Number(amount) || 0)} registrado` });
    setAmount("");
    setSaleId("");
    setNotes("");
    router.refresh();
  }

  async function handleVoid() {
    if (!voiding) return;
    setBusy(true);
    setMessage(null);
    const result = await voidAbono(voiding.id);
    setBusy(false);
    setVoiding(null);
    setMessage(result.error ? { type: "error", text: result.error } : { type: "ok", text: "Abono anulado" });
    router.refresh();
  }

  function sendReminder() {
    let number = normalizeWhatsappNumber(cliente.telefono);
    if (!number) {
      const typed = window.prompt(
        "Este cliente no tiene un WhatsApp válido. Escríbelo (ej: 3001234567):"
      );
      if (!typed) return;
      number = normalizeWhatsappNumber(typed);
      if (!number) {
        setMessage({ type: "error", text: "El número de WhatsApp no es válido" });
        return;
      }
    }
    const lines = [
      `Hola ${cliente.nombre}, te saludamos de ${orgName}.`,
      `Te recordamos que tienes un saldo pendiente de ${currency.format(debt)}` +
        (overdue > 0 ? `, de los cuales ${currency.format(overdue)} ya están vencidos.` : "."),
      ...pending
        .slice()
        .reverse()
        .map(
          (s) =>
            `• Factura ${saleLabel[s.id]}: ${currency.format(s.credit_balance)}` +
            (s.credit_due_date ? ` (vence ${formatDueDate(s.credit_due_date)})` : "")
        ),
      "¡Gracias!",
    ];
    window.open(
      `https://wa.me/${number}?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank",
      "noopener"
    );
  }

  const allocationsByPayment = new Map<string, CustomerPaymentAllocation[]>();
  for (const a of allocations) {
    allocationsByPayment.set(a.payment_id, [...(allocationsByPayment.get(a.payment_id) ?? []), a]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Debe</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">{currency.format(debt)}</CardContent>
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
            <CardTitle className="text-sm font-medium text-brand-muted">Cupo de fiado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">
            {limit === null ? (
              <span className="text-base font-normal text-brand-muted">
                Sin cupo (solo el administrador le fía)
              </span>
            ) : (
              <>
                {currency.format(limit)}
                <span className="block text-sm font-normal text-brand-muted">
                  Disponible {currency.format(Math.max(limit - debt, 0))}
                </span>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1" ref={formRef}>
          <CardHeader>
            <CardTitle className="text-base">Registrar abono</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {debt <= 0 ? (
              <p className="text-sm text-brand-muted">Este cliente está al día.</p>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="abonoSale">Aplicar a</Label>
                  <select
                    id="abonoSale"
                    value={saleId}
                    onChange={(event) => setSaleId(event.target.value)}
                    className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
                  >
                    <option value="">Lo más antiguo primero ({currency.format(debt)})</option>
                    {pending
                      .slice()
                      .reverse()
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          Factura {saleLabel[s.id]} · debe {currency.format(s.credit_balance)}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="abonoAmount">Valor</Label>
                  <div className="flex gap-2">
                    <Input
                      id="abonoAmount"
                      type="number"
                      min={0}
                      step="1"
                      inputMode="numeric"
                      placeholder="0"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={() => setAmount(String(maxAmount))}>
                      Todo
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Medio de pago</Label>
                  <div className="grid grid-cols-3 gap-1 text-xs">
                    {methods.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={`truncate rounded-[var(--radius-brand-sm)] border px-2 py-1.5 transition-colors ${
                          method === m
                            ? "border-brand bg-brand/10 text-brand-ink"
                            : "border-brand-border text-brand-muted"
                        }`}
                      >
                        {methodLabel(m, paymentSettings.otherLabel)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="abonoNotes">Nota (opcional)</Label>
                  <Input
                    id="abonoNotes"
                    maxLength={200}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                <Button disabled={busy || !(Number(amount) > 0)} onClick={handleAbono}>
                  {busy ? "Registrando..." : "Registrar abono"}
                </Button>
                <p className="text-xs text-brand-muted">
                  El abono entra a la caja de hoy por el medio de pago elegido.
                </p>
              </>
            )}
            {message && (
              <p className={`text-sm ${message.type === "ok" ? "text-brand-success" : "text-brand-danger"}`}>
                {message.text}
              </p>
            )}
            {debt > 0 && (
              <Button type="button" variant="outline" onClick={sendReminder}>
                <MessageCircle className="h-4 w-4 text-[#25D366]" />
                Recordar por WhatsApp
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold text-brand-ink">Ventas fiadas</h2>
            <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
              <table className="table-stack w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-left text-brand-muted">
                    <th className="p-3 font-medium">Factura</th>
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Fiado</th>
                    <th className="p-3 font-medium">Saldo</th>
                    <th className="p-3 font-medium">Vence</th>
                    <th className="p-3 font-medium text-right" />
                  </tr>
                </thead>
                <tbody>
                  {sales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-brand-muted">
                        Este cliente no tiene ventas fiadas.
                      </td>
                    </tr>
                  )}
                  {sales.map((s) => {
                    const late = !s.voided_at && s.credit_balance > 0 && !!s.credit_due_date && s.credit_due_date < today;
                    return (
                      <tr key={s.id} className="border-b border-brand-border last:border-0">
                        <td data-label="Factura" className="p-3">
                          <Link
                            href={`/dashboard/ventas-productos/${s.id}/factura`}
                            target="_blank"
                            className="font-medium text-brand-ink underline-offset-2 hover:underline"
                          >
                            {saleLabel[s.id]}
                          </Link>
                        </td>
                        <td data-label="Fecha" className="p-3 text-brand-muted">
                          {dateTime.format(new Date(s.created_at))}
                        </td>
                        <td data-label="Fiado" className="p-3">
                          {currency.format(s.pay_credito)}
                          {s.pay_credito < s.total && (
                            <span className="block text-xs text-brand-muted">
                              de {currency.format(s.total)}
                            </span>
                          )}
                        </td>
                        <td data-label="Saldo" className="p-3">
                          {s.voided_at ? (
                            <Badge variant="muted">
                              {s.void_kind === "devolucion" ? "Devuelta" : "Anulada"}
                            </Badge>
                          ) : s.credit_balance > 0 ? (
                            <span className="font-semibold text-brand-ink">
                              {currency.format(s.credit_balance)}
                            </span>
                          ) : (
                            <Badge variant="success">Pagada</Badge>
                          )}
                        </td>
                        <td data-label="Vence" className="p-3">
                          <span className={late ? "font-medium text-brand-danger" : "text-brand-muted"}>
                            {formatDueDate(s.credit_due_date) ?? "—"}
                            {late && " (vencida)"}
                          </span>
                        </td>
                        <td data-label="" className="p-3 text-right">
                          {!s.voided_at && s.credit_balance > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSaleId(s.id);
                                setAmount(String(s.credit_balance));
                                formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                            >
                              Abonar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-brand-ink">Abonos</h2>
            <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
              <table className="table-stack w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-left text-brand-muted">
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Valor</th>
                    <th className="p-3 font-medium">Medio</th>
                    <th className="p-3 font-medium">Aplicado a</th>
                    <th className="p-3 font-medium">Recibió</th>
                    {isAdmin && <th className="p-3 font-medium text-right" />}
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-brand-muted">
                        Aún no hay abonos.
                      </td>
                    </tr>
                  )}
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-brand-border last:border-0 ${p.voided_at ? "opacity-60" : ""}`}
                    >
                      <td data-label="Fecha" className="p-3 text-brand-muted">
                        {dateTime.format(new Date(p.created_at))}
                      </td>
                      <td data-label="Valor" className="p-3 font-medium text-brand-ink">
                        {currency.format(p.amount)}
                        {p.voided_at && (
                          <Badge variant="muted" className="ml-2">
                            Anulado
                          </Badge>
                        )}
                      </td>
                      <td data-label="Medio" className="p-3">
                        {p.method === "otro" ? p.method_label || "Otro" : methodLabel(p.method)}
                      </td>
                      <td data-label="Aplicado a" className="p-3 text-brand-muted">
                        {(allocationsByPayment.get(p.id) ?? [])
                          .map((a) => `${saleLabel[a.sale_id] ?? "—"} (${currency.format(a.amount)})`)
                          .join(", ") || "—"}
                        {p.notes && <span className="block text-xs">{p.notes}</span>}
                      </td>
                      <td data-label="Recibió" className="p-3 text-brand-muted">
                        {p.created_by_name ?? "—"}
                      </td>
                      {isAdmin && (
                        <td data-label="" className="p-3 text-right">
                          {!p.voided_at && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Anular abono"
                              onClick={() => setVoiding(p)}
                            >
                              <Trash2 className="h-4 w-4 text-brand-danger" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!voiding}
        onOpenChange={(open) => !open && setVoiding(null)}
        title="Anular abono"
        description={`Se anulará el abono de ${currency.format(voiding?.amount ?? 0)}: la deuda vuelve a subir y sale de la caja del día en que se recibió.`}
        confirmLabel="Anular abono"
        loadingLabel="Anulando..."
        isLoading={busy}
        onConfirm={handleVoid}
      />
    </div>
  );
}
