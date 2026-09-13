import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CategoryCard } from "@/components/catalogo/category-card";
import { AddCategoryButton } from "@/components/catalogo/add-category-button";
import type { Category } from "@/lib/supabase/types";

export default async function CatalogoPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true });

  const { data: products } = await supabase
    .from("products")
    .select("category_id")
    .eq("organization_id", profile.organization_id);

  const countsByCategory = new Map<string, number>();
  for (const row of products ?? []) {
    countsByCategory.set(row.category_id, (countsByCategory.get(row.category_id) ?? 0) + 1);
  }

  const list = (categories as Category[]) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Catálogo</h1>
          <p className="text-sm text-brand-muted">
            Organiza tus productos por categorías.
          </p>
        </div>
        <AddCategoryButton />
      </div>

      {list.length === 0 ? (
        <div className="rounded-[var(--radius-brand-md)] border border-dashed border-brand-border bg-white p-10 text-center text-brand-muted">
          Aún no tienes categorías. Crea la primera para empezar a cargar productos.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              productCount={countsByCategory.get(category.id) ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
