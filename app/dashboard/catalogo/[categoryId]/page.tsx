import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProductsTable } from "@/components/catalogo/products-table";
import type { Category, Product } from "@/lib/supabase/types";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ categoryId: string }>;
}) {
  const { categoryId } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!category) notFound();

  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .order("name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/catalogo"
          className="mb-2 inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Catálogo
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-ink">
          <span>{(category as Category).icon}</span>
          {(category as Category).name}
        </h1>
      </div>

      <ProductsTable
        categoryId={categoryId}
        products={(products as Product[]) ?? []}
        canEdit={profile.role === "owner"}
      />
    </div>
  );
}
