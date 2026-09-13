"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductFormDialog } from "@/components/catalogo/product-form-dialog";
import { createProduct, updateProduct, deleteProduct } from "@/lib/actions/catalogo";
import type { Product } from "@/lib/supabase/types";

const LOW_STOCK_THRESHOLD = 10;

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

interface ProductsTableProps {
  categoryId: string;
  products: Product[];
}

export function ProductsTable({ categoryId, products }: ProductsTableProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Product | null>(null);
  const [deleting, setDeleting] = React.useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const filtered = products.filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase())
  );

  const boundCreate = createProduct.bind(null, categoryId);
  const boundUpdate = editing ? updateProduct.bind(null, editing.id, categoryId) : undefined;

  async function handleDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    await deleteProduct(deleting.id, categoryId, deleting.name);
    setIsDeleting(false);
    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          <Input
            placeholder="Buscar producto..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar producto
        </Button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-brand-border text-left text-brand-muted">
              <th className="p-3 font-medium">Producto</th>
              <th className="p-3 font-medium">Cantidad</th>
              <th className="p-3 font-medium">Precio compra</th>
              <th className="p-3 font-medium">Precio venta</th>
              <th className="p-3 font-medium">Descripción</th>
              <th className="p-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-brand-muted">
                  No hay productos que coincidan.
                </td>
              </tr>
            )}
            {filtered.map((product) => (
              <tr key={product.id} className="border-b border-brand-border last:border-0">
                <td className="p-3 font-medium text-brand-ink">{product.name}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {product.quantity}
                    {product.quantity <= LOW_STOCK_THRESHOLD && (
                      <Badge variant="danger">Bajo stock</Badge>
                    )}
                  </div>
                </td>
                <td className="p-3">{currency.format(product.purchase_price)}</td>
                <td className="p-3">{currency.format(product.sale_price)}</td>
                <td className="p-3 text-brand-muted">{product.description || "—"}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(product)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(product)}>
                      <Trash2 className="h-4 w-4 text-brand-danger" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductFormDialog open={addOpen} onOpenChange={setAddOpen} action={boundCreate} />

      {editing && boundUpdate && (
        <ProductFormDialog
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
          product={editing}
          action={boundUpdate}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar producto"
        description={`¿Deseas eliminar "${deleting?.name}"? Esta acción no se puede deshacer.`}
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
