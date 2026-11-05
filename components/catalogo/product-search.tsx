"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { searchProducts, type ProductSearchResult } from "@/lib/actions/catalogo";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Buscador de productos de todo el catálogo, sin importar la categoría. */
export function ProductSearch() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      searchProducts(trimmed).then((found) => {
        setResults(found);
        setSearched(true);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative sm:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
        <Input
          placeholder="Buscar un producto en todo el catálogo..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="pl-9"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="overflow-hidden rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
          {loading && results.length === 0 && (
            <p className="p-4 text-sm text-brand-muted">Buscando...</p>
          )}
          {!loading && searched && results.length === 0 && (
            <p className="p-4 text-sm text-brand-muted">No se encontraron productos.</p>
          )}
          {results.map((product) => (
            <Link
              key={product.id}
              href={`/dashboard/catalogo/${product.category_id}`}
              className="flex items-center justify-between gap-3 border-b border-brand-border p-3 text-sm last:border-0 hover:bg-black/5"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-ink">{product.name}</p>
                <p className="truncate text-xs text-brand-muted">
                  {product.category_icon} {product.category_name}
                  {product.barcode ? ` · Cód: ${product.barcode}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium text-brand-ink">{currency.format(product.sale_price)}</p>
                <p
                  className={`text-xs ${product.quantity <= 10 ? "text-brand-danger" : "text-brand-muted"}`}
                >
                  Stock: {product.quantity}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
