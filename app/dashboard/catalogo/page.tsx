import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoryCard } from "@/components/catalogo/category-card";
import { AddCategoryButton } from "@/components/catalogo/add-category-button";
import { ProductSearch } from "@/components/catalogo/product-search";
import type { Category } from "@/lib/supabase/types";

export default async function CatalogoPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true });

  const { data: org } = await supabase
    .from("organizations")
    .select("business_type")
    .eq("id", profile.organization_id)
    .single();
  const businessType = org?.business_type ?? "general";

  const { data: products } = await supabase
    .from("products")
    .select("category_id")
    .eq("organization_id", profile.organization_id);

  const countsByCategory = new Map<string, number>();
  for (const row of products ?? []) {
    countsByCategory.set(row.category_id, (countsByCategory.get(row.category_id) ?? 0) + 1);
  }

  // Sin la migración 027 la función no existe y simplemente no se muestra el aviso.
  const { data: lowStock } = await supabase.rpc("low_stock_count");
  const lowStockCount = Number(lowStock ?? 0);

  const list = (categories as Category[]) ?? [];
  const canEdit = profile.role === "owner";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Catálogo</h1>
          <p className="text-sm text-brand-muted">
            Organiza tus productos por categorías.
          </p>
        </div>
        {canEdit && (
          <AddCategoryButton businessType={businessType} />
        )}
      </div>

      {lowStockCount > 0 && (
        <Link
          href="/dashboard/catalogo/por-agotarse"
          className="flex items-center gap-3 rounded-[var(--radius-brand-md)] border border-brand-danger/40 bg-brand-danger/5 p-3 text-sm text-brand-ink hover:bg-brand-danger/10"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-brand-danger" />
          <span className="flex-1">
            <span className="font-semibold">
              {lowStockCount} {lowStockCount === 1 ? "producto está" : "productos están"} por agotarse o agotados.
            </span>{" "}
            {canEdit ? "Mira la lista y el pedido sugerido." : "Mira la lista para avisarle al administrador."}
          </span>
          <span className="font-medium underline">Ver</span>
        </Link>
      )}

      {list.length > 0 && <ProductSearch />}

      {list.length === 0 ? (
        <div className="empty-glow rounded-[var(--radius-brand-md)] p-10 text-center text-brand-muted">
          Aún no tienes categorías. Crea la primera para empezar a cargar productos.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              productCount={countsByCategory.get(category.id) ?? 0}
              canEdit={canEdit}
              businessType={businessType}
            />
          ))}
        </div>
      )}
    </div>
  );
}
