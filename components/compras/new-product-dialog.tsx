"use client";

import * as React from "react";
import Link from "next/link";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductForPurchase, type CreatedPurchaseProduct } from "@/lib/actions/compras";
import { TAX_OPTIONS, type TaxSettings } from "@/lib/tax";

export type PurchaseCategory = { id: string; name: string; icon: string };

/** Crea un producto sin salir de la compra (queda en el Catálogo con stock 0). */
export function NewProductDialog({
  open,
  onOpenChange,
  categories,
  taxSettings,
  initialText,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: PurchaseCategory[];
  taxSettings: TaxSettings;
  /** Lo que se escribió en el buscador: si son solo dígitos se toma como código de barras. */
  initialText: string;
  onCreated: (product: CreatedPurchaseProduct) => void;
}) {
  const [categoryId, setCategoryId] = React.useState("");
  const [name, setName] = React.useState("");
  const [barcode, setBarcode] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [salePrice, setSalePrice] = React.useState("");
  const [tax, setTax] = React.useState(TAX_OPTIONS[0]?.value ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Al abrir se precarga lo que se buscó.
  React.useEffect(() => {
    if (!open) return;
    const text = initialText.trim();
    const looksLikeCode = /^\d{6,}$/.test(text);
    setName(looksLikeCode ? "" : text);
    setBarcode(looksLikeCode ? text : "");
    setUnitCost("");
    setSalePrice("");
    setError(null);
    setCategoryId((prev) => prev || categories[0]?.id || "");
  }, [open, initialText, categories]);

  const cost = Number(unitCost) || 0;
  const sale = Number(salePrice) || 0;
  const margin = sale > 0 ? ((sale - cost) / sale) * 100 : null;

  async function handleSave() {
    setError(null);
    setBusy(true);
    const result = await createProductForPurchase({
      categoryId,
      name,
      barcode,
      unitCost: unitCost || 0,
      salePrice: salePrice || 0,
      tax: taxSettings.taxEnabled ? tax : undefined,
    });
    setBusy(false);
    if (result.error || !result.product) {
      setError(result.error ?? "No se pudo crear el producto");
      return;
    }
    onCreated(result.product);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Producto nuevo</DialogTitle>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="text-sm text-brand-muted">
            Primero crea al menos una categoría en{" "}
            <Link href="/dashboard/catalogo" className="underline">
              Catálogo
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="np-name">Nombre</Label>
                <Input id="np-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="np-category">Categoría</Label>
                <select
                  id="np-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="np-barcode">Código de barras (opcional)</Label>
                <Input id="np-barcode" maxLength={64} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="np-cost">Costo unitario en esta compra</Label>
                <Input
                  id="np-cost"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="np-sale">
                  Precio de venta
                  {taxSettings.taxEnabled && (taxSettings.pricesIncludeTax ? " (con impuesto)" : " (sin impuesto)")}
                </Label>
                <Input
                  id="np-sale"
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                />
                {margin !== null && (
                  <span className={`text-xs ${margin < 0 ? "text-brand-danger" : "text-brand-muted"}`}>
                    Margen {margin.toFixed(0)}%
                  </span>
                )}
              </div>
              {taxSettings.taxEnabled && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="np-tax">Impuesto</Label>
                  <select
                    id="np-tax"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
                  >
                    {TAX_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="text-xs text-brand-muted">
              El producto queda en el Catálogo con stock 0. La cantidad entra al inventario cuando
              registres la compra.
            </p>
            {error && <p className="text-sm text-brand-danger">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {categories.length > 0 && (
            <Button type="button" disabled={busy || !name.trim()} onClick={handleSave}>
              {busy ? "Creando..." : "Crear y agregar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
