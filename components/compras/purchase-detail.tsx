"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AttachmentPicker } from "@/components/attachment-picker";
import { PurchaseStatus } from "@/components/compras/purchases-table";
import {
  attachPurchaseFile,
  getPurchaseFileUrl,
  registerSupplierPayment,
  removePurchaseFile,
  voidPurchase,
  voidSupplierPayment,
} from "@/lib/actions/compras";
import { formatDueDate } from "@/lib/payments";
import type { Purchase, SupplierPayment } from "@/lib/supabase/types";

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

export function PurchaseDetail({
  purchase,
  payments,
  today,
  fileUploadFailed = false,
}: {
  purchase: Purchase;
  payments: SupplierPayment[];
  today: string;
  fileUploadFailed?: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [source, setSource] = React.useState<"caja" | "externo">("externo");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [confirmVoid, setConfirmVoid] = React.useState(false);
  const [voidingPayment, setVoidingPayment] = React.useState<SupplierPayment | null>(null);
  const [replacingFile, setReplacingFile] = React.useState(false);
  const [preparingFile, setPreparingFile] = React.useState(false);
  const [fileBusy, setFileBusy] = React.useState(false);
  const [fileMessage, setFileMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(
    fileUploadFailed && !purchase.file_path
      ? { type: "error", text: "La compra quedó registrada, pero no se pudo subir el soporte. Inténtalo de nuevo aquí." }
      : null
  );
  const [confirmRemoveFile, setConfirmRemoveFile] = React.useState(false);
  const fileFormRef = React.useRef<HTMLFormElement>(null);

  async function openFile() {
    setFileMessage(null);
    // La pestaña se abre antes de la espera para que el navegador no la bloquee.
    const tab = window.open("", "_blank");
    const result = await getPurchaseFileUrl(purchase.id);
    if (result.url && tab) tab.location.href = result.url;
    else {
      tab?.close();
      setFileMessage({ type: "error", text: result.error ?? "No se pudo abrir el soporte" });
    }
  }

  async function uploadFile() {
    const data = fileFormRef.current ? new FormData(fileFormRef.current) : null;
    const file = data?.get("file") as File | null;
    if (!data || !file || file.size === 0) {
      setFileMessage({ type: "error", text: "Elige una foto o un PDF" });
      return;
    }
    setFileBusy(true);
    setFileMessage(null);
    const result = await attachPurchaseFile(purchase.id, data);
    setFileBusy(false);
    if (result.error) setFileMessage({ type: "error", text: result.error });
    else {
      setFileMessage({ type: "ok", text: result.success ?? "Soporte guardado" });
      setReplacingFile(false);
      router.replace(`/dashboard/compras/${purchase.id}`);
      router.refresh();
    }
  }

  const voided = !!purchase.voided_at;
  const owes = !voided && purchase.balance > 0;
  const activePayments = payments.filter((p) => !p.voided_at);

  async function run(action: () => Promise<{ error?: string; success?: string }>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    setMessage(result.error ? { type: "error", text: result.error } : { type: "ok", text: result.success ?? "Listo" });
    router.refresh();
    return !result.error;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-brand-ink">{currency.format(purchase.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Pago</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <PurchaseStatus purchase={purchase} today={today} />
            <span className="text-brand-muted">
              {purchase.payment_type === "contado"
                ? purchase.pay_source === "caja"
                  ? "De contado, desde la caja"
                  : "De contado, por fuera de la caja"
                : `A crédito · vence ${formatDueDate(purchase.due_date) ?? "—"}`}
            </span>
            <span className="text-brand-muted">Fecha de la factura: {formatDueDate(purchase.purchase_date)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-brand-muted">Se debe</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-semibold ${owes ? "text-brand-danger" : "text-brand-success"}`}>
            {currency.format(owes ? purchase.balance : 0)}
          </CardContent>
        </Card>
      </div>

      {voided && (
        <p className="text-sm text-brand-muted">
          Anulada el {dateTime.format(new Date(purchase.voided_at!))}
          {purchase.void_reason ? ` · ${purchase.void_reason}` : ""}. El stock y el costo se revirtieron.
        </p>
      )}
      {purchase.notes && <p className="text-sm text-brand-muted">Notas: {purchase.notes}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Soporte de la factura</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {purchase.file_path && !replacingFile ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={openFile}>
                <FileText className="h-4 w-4" />
                Ver soporte
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReplacingFile(true)}>
                Reemplazar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmRemoveFile(true)}>
                <Trash2 className="h-4 w-4 text-brand-danger" />
                Quitar
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-brand-muted">
                Adjunta la foto o el PDF de la factura del proveedor. Solo lo ve el administrador y también queda en el archivo de Facturas.
              </p>
              <form ref={fileFormRef} onSubmit={(e) => e.preventDefault()}>
                <AttachmentPicker onBusyChange={setPreparingFile} />
              </form>
              <div className="flex gap-2">
                <Button type="button" disabled={fileBusy || preparingFile} onClick={uploadFile}>
                  {fileBusy ? "Subiendo..." : "Guardar soporte"}
                </Button>
                {replacingFile && (
                  <Button type="button" variant="outline" onClick={() => setReplacingFile(false)}>
                    Cancelar
                  </Button>
                )}
              </div>
            </>
          )}
          {fileMessage && (
            <p className={`text-sm ${fileMessage.type === "ok" ? "text-brand-success" : "text-brand-danger"}`}>
              {fileMessage.text}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="table-stack w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Producto</th>
              <th className="p-3 font-medium">Cantidad</th>
              <th className="p-3 font-medium">Costo unitario</th>
              <th className="p-3 font-medium">Subtotal</th>
              <th className="p-3 font-medium">Costo promedio</th>
              <th className="p-3 font-medium">Precio de venta</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.productId} className="border-b border-brand-border last:border-0">
                <td data-label="Producto" className="p-3 font-medium text-brand-ink">{item.name}</td>
                <td data-label="Cantidad" className="p-3">{item.quantity}</td>
                <td data-label="Costo unitario" className="p-3">{currency.format(Number(item.unitCost))}</td>
                <td data-label="Subtotal" className="p-3 font-medium">{currency.format(Number(item.subtotal))}</td>
                <td data-label="Costo promedio" className="p-3 text-brand-muted">
                  {currency.format(Number(item.previousCost))} → {currency.format(Number(item.newCost))}
                </td>
                <td data-label="Precio de venta" className="p-3 text-brand-muted">
                  {Number(item.salePrice) !== Number(item.previousSalePrice)
                    ? `${currency.format(Number(item.previousSalePrice))} → ${currency.format(Number(item.salePrice))}`
                    : currency.format(Number(item.salePrice))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {purchase.payment_type === "credito" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registrar pago</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!owes ? (
                <p className="text-sm text-brand-muted">{voided ? "Compra anulada." : "Esta compra ya está pagada."}</p>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="payAmount">Valor</Label>
                    <div className="flex gap-2">
                      <Input
                        id="payAmount"
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <Button type="button" variant="outline" onClick={() => setAmount(String(purchase.balance))}>
                        Todo
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {(["caja", "externo"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSource(s)}
                        className={`rounded-[var(--radius-brand-sm)] border px-2 py-1.5 ${
                          source === s ? "border-brand bg-brand/10 text-brand-ink" : "border-brand-border text-brand-muted"
                        }`}
                      >
                        {s === "caja" ? "Desde la caja" : "Por fuera de la caja"}
                      </button>
                    ))}
                  </div>
                  <Input placeholder="Nota (opcional)" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button
                    disabled={busy || !(Number(amount) > 0)}
                    onClick={async () => {
                      const ok = await run(() =>
                        registerSupplierPayment({ purchaseId: purchase.id, amount, source, notes })
                      );
                      if (ok) {
                        setAmount("");
                        setNotes("");
                      }
                    }}
                  >
                    {busy ? "Registrando..." : "Registrar pago"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-semibold text-brand-ink">Pagos</h2>
            <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
              <table className="table-stack w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-left text-brand-muted">
                    <th className="p-3 font-medium">Fecha</th>
                    <th className="p-3 font-medium">Valor</th>
                    <th className="p-3 font-medium">Desde</th>
                    <th className="p-3 font-medium">Registró</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-brand-muted">Aún no hay pagos.</td>
                    </tr>
                  )}
                  {payments.map((pay) => (
                    <tr key={pay.id} className={`border-b border-brand-border last:border-0 ${pay.voided_at ? "opacity-60" : ""}`}>
                      <td data-label="Fecha" className="p-3 text-brand-muted">{dateTime.format(new Date(pay.created_at))}</td>
                      <td data-label="Valor" className="p-3 font-medium">
                        {currency.format(pay.amount)}
                        {pay.voided_at && <Badge variant="muted" className="ml-2">Anulado</Badge>}
                        {pay.notes && <span className="block text-xs text-brand-muted">{pay.notes}</span>}
                      </td>
                      <td data-label="Desde" className="p-3">{pay.source === "caja" ? "Caja" : "Por fuera"}</td>
                      <td data-label="Registró" className="p-3 text-brand-muted">{pay.created_by_name ?? "—"}</td>
                      <td data-label="" className="p-3 text-right">
                        {!pay.voided_at && (
                          <Button variant="ghost" size="icon" aria-label="Anular pago" onClick={() => setVoidingPayment(pay)}>
                            <Trash2 className="h-4 w-4 text-brand-danger" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-brand-success" : "text-brand-danger"}`}>{message.text}</p>
      )}

      {!voided && (
        <div>
          <Button
            variant="outline"
            disabled={busy || activePayments.length > 0}
            onClick={() => setConfirmVoid(true)}
          >
            <Ban className="h-4 w-4 text-brand-danger" />
            Anular compra
          </Button>
          {activePayments.length > 0 && (
            <p className="mt-1 text-xs text-brand-muted">Para anularla, primero anula sus pagos.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title="Anular compra"
        description="Se resta del inventario lo que trajo esta compra y el costo promedio vuelve a como estaba. El precio de venta no cambia. Si ya se vendió parte de la mercancía y no alcanza el stock, no se podrá anular."
        confirmLabel="Anular compra"
        loadingLabel="Anulando..."
        isLoading={busy}
        onConfirm={async () => {
          setConfirmVoid(false);
          await run(() => voidPurchase(purchase.id));
        }}
      />
      <ConfirmDialog
        open={confirmRemoveFile}
        onOpenChange={setConfirmRemoveFile}
        title="Quitar soporte"
        description="Se borra el archivo adjunto de esta compra. La compra no cambia."
        confirmLabel="Quitar"
        loadingLabel="Quitando..."
        isLoading={fileBusy}
        onConfirm={async () => {
          setConfirmRemoveFile(false);
          setFileBusy(true);
          const result = await removePurchaseFile(purchase.id);
          setFileBusy(false);
          setFileMessage(result.error ? { type: "error", text: result.error } : { type: "ok", text: "Soporte eliminado" });
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={!!voidingPayment}
        onOpenChange={(open) => !open && setVoidingPayment(null)}
        title="Anular pago"
        description={`Se anulará el pago de ${currency.format(voidingPayment?.amount ?? 0)} y la deuda con el proveedor vuelve a subir.`}
        confirmLabel="Anular pago"
        loadingLabel="Anulando..."
        isLoading={busy}
        onConfirm={async () => {
          const pay = voidingPayment;
          setVoidingPayment(null);
          if (pay) await run(() => voidSupplierPayment(pay.id));
        }}
      />
    </div>
  );
}
