"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingCart, Trash2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSale } from "@/lib/actions/ventas-productos";
import { searchClientes } from "@/lib/actions/clientes";
import type { Cliente, Product } from "@/lib/supabase/types";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface CartLine {
  product: Product;
  quantity: number;
}

interface SaleCartProps {
  products: Product[];
}

type CustomerMode = "none" | "existing" | "new";

const CUSTOMER_MODE_LABEL: Record<CustomerMode, string> = {
  none: "Consumidor final",
  existing: "Cliente existente",
  new: "Cliente nuevo",
};

export function SaleCart({ products }: SaleCartProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<Record<string, CartLine>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [customerMode, setCustomerMode] = React.useState<CustomerMode>("none");
  const [customerQuery, setCustomerQuery] = React.useState("");
  const [customerResults, setCustomerResults] = React.useState<Cliente[]>([]);
  const [selectedCustomer, setSelectedCustomer] = React.useState<Cliente | null>(null);
  const [newCustomer, setNewCustomer] = React.useState({
    nombre: "",
    documento: "",
    telefono: "",
    direccion: "",
  });

  const term = search.toLowerCase();
  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(term) || (p.barcode ?? "").toLowerCase().includes(term)
  );

  const lines = Object.values(cart);
  const total = lines.reduce((sum, line) => sum + line.product.sale_price * line.quantity, 0);

  React.useEffect(() => {
    if (customerMode !== "existing" || selectedCustomer) {
      setCustomerResults([]);
      return;
    }
    const trimmed = customerQuery.trim();
    if (trimmed.length < 2) {
      setCustomerResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      searchClientes(trimmed).then(({ results }) => setCustomerResults(results));
    }, 300);
    return () => clearTimeout(timeout);
  }, [customerQuery, customerMode, selectedCustomer]);

  function selectCustomerMode(mode: CustomerMode) {
    setCustomerMode(mode);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
  }

  function addToCart(product: Product) {
    setError(null);
    setSuccess(null);
    setCart((prev) => {
      const existing = prev[product.id];
      const nextQty = (existing?.quantity ?? 0) + 1;
      if (nextQty > product.quantity) return prev;
      return { ...prev, [product.id]: { product, quantity: nextQty } };
    });
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const rest = { ...prev };
        delete rest[productId];
        return rest;
      }
      if (nextQty > existing.product.quantity) return prev;
      return { ...prev, [productId]: { ...existing, quantity: nextQty } };
    });
  }

  function removeLine(productId: string) {
    setCart((prev) => {
      const rest = { ...prev };
      delete rest[productId];
      return rest;
    });
  }

  async function handleConfirm() {
    if (lines.length === 0) return;
    if (customerMode === "new" && !newCustomer.nombre.trim()) {
      setError("Ingresa el nombre del cliente");
      return;
    }
    if (customerMode === "existing" && !selectedCustomer) {
      setError("Selecciona un cliente de la lista, o cambia a Consumidor final / Cliente nuevo");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const customer =
      customerMode === "existing" && selectedCustomer
        ? { id: selectedCustomer.id }
        : customerMode === "new"
          ? { data: newCustomer }
          : undefined;

    const result = await createSale(
      lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      customer
    );

    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    setSuccess(`Venta registrada por ${currency.format(result.total ?? 0)}`);
    setCart({});
    selectCustomerMode("none");
    setNewCustomer({ nombre: "", documento: "", telefono: "", direccion: "" });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar producto o código de barras..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.length === 0 && (
            <p className="col-span-full text-center text-sm text-brand-muted">
              No hay productos que coincidan.
            </p>
          )}
          {filtered.map((product) => {
            const inCart = cart[product.id]?.quantity ?? 0;
            const outOfStock = product.quantity <= 0;
            return (
              <button
                key={product.id}
                type="button"
                disabled={outOfStock || inCart >= product.quantity}
                onClick={() => addToCart(product)}
                className="flex flex-col gap-1 rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3 text-left transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="truncate text-sm font-medium text-brand-ink">{product.name}</p>
                <p className="text-sm text-brand-muted">{currency.format(product.sale_price)}</p>
                <p className="text-xs text-brand-muted">
                  {outOfStock ? "Sin stock" : `Stock: ${product.quantity}`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-1 rounded-[var(--radius-brand-sm)] border border-brand-border p-1 text-xs">
              {(Object.keys(CUSTOMER_MODE_LABEL) as CustomerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectCustomerMode(mode)}
                  className={`flex-1 rounded-[var(--radius-brand-sm)] px-2 py-1 transition-colors ${
                    customerMode === mode ? "bg-brand text-brand-ink" : "text-brand-muted"
                  }`}
                >
                  {CUSTOMER_MODE_LABEL[mode]}
                </button>
              ))}
            </div>

            {customerMode === "existing" &&
              (selectedCustomer ? (
                <div className="flex items-center justify-between rounded-[var(--radius-brand-sm)] border border-brand-border p-2 text-sm">
                  <div>
                    <p className="font-medium text-brand-ink">{selectedCustomer.nombre}</p>
                    {selectedCustomer.documento && (
                      <p className="text-xs text-brand-muted">{selectedCustomer.documento}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                    Cambiar
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    placeholder="Buscar por nombre o documento..."
                    value={customerQuery}
                    onChange={(event) => setCustomerQuery(event.target.value)}
                  />
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white shadow-md">
                      {customerResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(c);
                            setCustomerResults([]);
                          }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                        >
                          <p className="font-medium text-brand-ink">{c.nombre}</p>
                          {c.documento && <p className="text-xs text-brand-muted">{c.documento}</p>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {customerMode === "new" && (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Nombre *"
                  value={newCustomer.nombre}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, nombre: event.target.value }))
                  }
                />
                <Input
                  placeholder="Documento (opcional)"
                  value={newCustomer.documento}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, documento: event.target.value }))
                  }
                />
                <Input
                  placeholder="Teléfono (opcional)"
                  value={newCustomer.telefono}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, telefono: event.target.value }))
                  }
                />
                <Input
                  placeholder="Dirección (opcional)"
                  value={newCustomer.direccion}
                  onChange={(event) =>
                    setNewCustomer((c) => ({ ...c, direccion: event.target.value }))
                  }
                />
                <p className="text-xs text-brand-muted">
                  Queda guardado como cliente para futuras ventas.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" />
              Carrito
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {lines.length === 0 && (
              <p className="text-sm text-brand-muted">Selecciona productos para agregarlos aquí.</p>
            )}
            {lines.map((line) => (
              <div key={line.product.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-brand-ink">{line.product.name}</p>
                  <p className="text-xs text-brand-muted">
                    {currency.format(line.product.sale_price)} c/u ·{" "}
                    {currency.format(line.product.sale_price * line.quantity)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeQuantity(line.product.id, -1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center">{line.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => changeQuantity(line.product.id, 1)}
                    disabled={line.quantity >= line.product.quantity}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeLine(line.product.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-brand-danger" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-t border-brand-border pt-3 font-semibold text-brand-ink">
              <span>Total</span>
              <span>{currency.format(total)}</span>
            </div>

            {error && <p className="text-sm text-brand-danger">{error}</p>}
            {success && <p className="text-sm text-brand-success">{success}</p>}

            <Button disabled={lines.length === 0 || submitting} onClick={handleConfirm}>
              {submitting ? "Registrando..." : "Confirmar venta"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
