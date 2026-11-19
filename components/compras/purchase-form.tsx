"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupplierFormDialog } from "@/components/compras/supplier-form-dialog";
import { NewProductDialog, type PurchaseCategory } from "@/components/compras/new-product-dialog";
import { AttachmentPicker } from "@/components/attachment-picker";
import { attachPurchaseFile, createPurchase, createSupplier } from "@/lib/actions/compras";
import type { TaxSettings } from "@/lib/tax";
import type { Supplier } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export type PurchaseProduct = {
  id: string;
  name: string;
  barcode: string | null;
  quantity: number;
  purchase_price: number;
  sale_price: number;
};

interface Line {
  product: PurchaseProduct;
  quantity: string;
  unitCost: string;
  salePrice: string;
}

type PayType = "caja" | "externo" | "credito";

const PAY_LABEL: Record<PayType, string> = {
  caja: "Contado, desde la caja",
  externo: "Contado, por fuera de la caja",
  credito: "A crédito",
};

export function PurchaseForm({
  products,
  suppliers,
  categories,
  taxSettings,
  today,
}: {
  products: PurchaseProduct[];
  suppliers: Supplier[];
  categories: PurchaseCategory[];
  taxSettings: TaxSettings;
  today: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = React.useState("");
  const [supplierOpen, setSupplierOpen] = React.useState(false);
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [purchaseDate, setPurchaseDate] = React.useState(today);
  const [search, setSearch] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [payType, setPayType] = React.useState<PayType>("externo");
  const [days, setDays] = React.useState("30");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newProductOpen, setNewProductOpen] = React.useState(false);
  const [newProductText, setNewProductText] = React.useState("");
  const [preparingFile, setPreparingFile] = React.useState(false);
  const fileFormRef = React.useRef<HTMLFormElement>(null);

  function openNewProduct() {
    setNewProductText(search);
    setNewProductOpen(true);
  }

  const term = search.trim().toLowerCase();
  const results =
    term.length < 1
      ? []
      : products
          .filter(
            (p) =>
              !lines.some((l) => l.product.id === p.id) &&
              (p.name.toLowerCase().includes(term) || (p.barcode ?? "").toLowerCase() === term)
          )
          .slice(0, 8);

  function addProduct(product: PurchaseProduct) {
    setLines((prev) => [
      ...prev,
      { product, quantity: "1", unitCost: String(Number(product.purchase_price)), salePrice: "" },
    ]);
    setSearch("");
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce(
    (sum, l) => sum + Math.round((Number(l.quantity) || 0) * (Number(l.unitCost) || 0) * 100) / 100,
    0
  );

  async function handleSubmit() {
    setError(null);
    if (lines.length === 0) {
      setError("Agrega al menos un producto");
      return;
    }
    if (payType === "credito" && !supplierId) {
      setError("Para comprar a crédito elige el proveedor");
      return;
    }
    setBusy(true);
    const result = await createPurchase({
      supplierId: supplierId || undefined,
      invoiceNumber,
      purchaseDate,
      items: lines.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        unitCost: l.unitCost,
        salePrice: l.salePrice,
      })),
      payment: payType === "credito" ? { type: "credito", days } : { type: "contado", source: payType },
      notes,
    });
    if (result.error || !result.id) {
      setBusy(false);
      setError(result.error ?? "No se pudo registrar la compra");
      return;
    }
    // El soporte se sube aparte: si falla, la compra ya quedó y se puede
    // adjuntar de nuevo desde su detalle.
    let fileFailed = false;
    const fileData = fileFormRef.current ? new FormData(fileFormRef.current) : null;
    const file = fileData?.get("file") as File | null;
    if (fileData && file && file.size > 0) {
      const uploaded = await attachPurchaseFile(result.id, fileData);
      fileFailed = !!uploaded.error;
    }
    setBusy(false);
    router.push(`/dashboard/compras/${result.id}${fileFailed ? "?soporte=error" : ""}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de la compra</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">Proveedor</Label>
            <div className="flex gap-2">
              <select
                id="supplier"
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
              >
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="icon" aria-label="Nuevo proveedor" onClick={() => setSupplierOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoice">N.º de factura del proveedor</Label>
            <Input id="invoice" maxLength={60} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">Fecha de la factura</Label>
            <Input id="date" type="date" max={today} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="relative sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
            <Input
              placeholder="Buscar producto o escanear código de barras..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results.length > 0) {
                  event.preventDefault();
                  addProduct(results[0]);
                }
              }}
              className="pl-9"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white shadow-md">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                  >
                    <span className="font-medium text-brand-ink">{p.name}</span>
                    <span className="block text-xs text-brand-muted">
                      Stock {p.quantity} · costo {currency.format(Number(p.purchase_price))} · venta{" "}
                      {currency.format(Number(p.sale_price))}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {term.length > 0 && results.length === 0 && (
              <p className="mt-1 text-xs text-brand-muted">
                No se encontró.{" "}
                <button type="button" className="font-medium text-brand-ink underline" onClick={openNewProduct}>
                  Crear &quot;{search.trim()}&quot; como producto nuevo
                </button>
              </p>
            )}
          </div>
          <Button type="button" variant="outline" className="self-start" onClick={openNewProduct}>
            <Plus className="h-4 w-4" />
            Producto nuevo
          </Button>

          {lines.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border">
              <table className="table-stack w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-brand-border text-left text-brand-muted">
                    <th className="p-2 font-medium">Producto</th>
                    <th className="p-2 font-medium">Cantidad</th>
                    <th className="p-2 font-medium">Costo unitario</th>
                    <th className="p-2 font-medium">Subtotal</th>
                    <th className="p-2 font-medium">Nuevo costo promedio</th>
                    <th className="p-2 font-medium">Nuevo precio de venta</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const q = Number(l.quantity) || 0;
                    const c = Number(l.unitCost) || 0;
                    const q0 = Math.max(l.product.quantity, 0);
                    const c0 = Number(l.product.purchase_price);
                    const avg = q0 > 0 && q > 0 ? (q0 * c0 + q * c) / (q0 + q) : c;
                    const sale = l.salePrice === "" ? Number(l.product.sale_price) : Number(l.salePrice) || 0;
                    const margin = sale > 0 ? ((sale - avg) / sale) * 100 : null;
                    return (
                      <tr key={l.product.id} className="border-b border-brand-border last:border-0">
                        <td data-label="Producto" className="p-2">
                          <span className="font-medium text-brand-ink">{l.product.name}</span>
                          <span className="block text-xs text-brand-muted">
                            Stock {l.product.quantity} → {l.product.quantity + q}
                          </span>
                        </td>
                        <td data-label="Cantidad" className="p-2">
                          <Input
                            type="number"
                            min={1}
                            step="1"
                            inputMode="numeric"
                            className="h-9 w-24"
                            value={l.quantity}
                            onChange={(e) => updateLine(l.product.id, { quantity: e.target.value })}
                          />
                        </td>
                        <td data-label="Costo unitario" className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            className="h-9 w-32"
                            value={l.unitCost}
                            onChange={(e) => updateLine(l.product.id, { unitCost: e.target.value })}
                          />
                        </td>
                        <td data-label="Subtotal" className="p-2 font-medium">{currency.format(q * c)}</td>
                        <td data-label="Nuevo costo promedio" className="p-2">
                          {currency.format(avg)}
                          {Math.abs(avg - c0) >= 1 && (
                            <span className="block text-xs text-brand-muted">antes {currency.format(c0)}</span>
                          )}
                        </td>
                        <td data-label="Nuevo precio de venta" className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            inputMode="decimal"
                            className="h-9 w-32"
                            placeholder={String(Number(l.product.sale_price))}
                            value={l.salePrice}
                            onChange={(e) => updateLine(l.product.id, { salePrice: e.target.value })}
                          />
                          {margin !== null && (
                            <span className={`block text-xs ${margin < 0 ? "text-brand-danger" : "text-brand-muted"}`}>
                              Margen {margin.toFixed(0)}%
                            </span>
                          )}
                        </td>
                        <td data-label="" className="p-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Quitar producto"
                            onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                          >
                            <Trash2 className="h-4 w-4 text-brand-danger" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-brand-muted">
            Deja &quot;Nuevo precio de venta&quot; vacío para no cambiarlo. El margen se calcula sobre el
            nuevo costo promedio.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pago</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-sm sm:grid-cols-3">
            {(Object.keys(PAY_LABEL) as PayType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPayType(t)}
                className={`rounded-[var(--radius-brand-sm)] px-3 py-2 ${
                  payType === t ? "bg-brand text-brand-ink" : "text-brand-muted"
                }`}
              >
                {PAY_LABEL[t]}
              </button>
            ))}
          </div>
          {payType === "caja" && (
            <p className="text-xs text-brand-muted">
              El valor sale del efectivo de la caja de hoy (se resta en el cierre de caja).
            </p>
          )}
          {payType === "externo" && (
            <p className="text-xs text-brand-muted">Pagada por banco, transferencia u otra cuenta: no toca la caja.</p>
          )}
          {payType === "credito" && (
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="days">Plazo para pagar (días desde la fecha de la factura)</Label>
              <Input id="days" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Soporte: foto o PDF de la factura del proveedor (opcional)</Label>
            <form ref={fileFormRef} onSubmit={(e) => e.preventDefault()}>
              <AttachmentPicker onBusyChange={setPreparingFile} />
            </form>
          </div>

          <div className="flex items-center justify-between border-t border-brand-border pt-3 text-lg font-semibold text-brand-ink">
            <span>Total de la compra</span>
            <span>{currency.format(total)}</span>
          </div>
          {error && <p className="text-sm text-brand-danger">{error}</p>}
          <Button className="self-end" disabled={busy || preparingFile || lines.length === 0} onClick={handleSubmit}>
            {busy ? "Registrando..." : "Registrar compra"}
          </Button>
        </CardContent>
      </Card>

      <NewProductDialog
        open={newProductOpen}
        onOpenChange={setNewProductOpen}
        categories={categories}
        taxSettings={taxSettings}
        initialText={newProductText}
        onCreated={(product) => {
          addProduct(product);
          router.refresh();
        }}
      />
      <SupplierFormDialog
        open={supplierOpen}
        onOpenChange={setSupplierOpen}
        action={createSupplier}
        onSaved={(result) => {
          if (result.id) setSupplierId(result.id);
          router.refresh();
        }}
      />
    </div>
  );
}
