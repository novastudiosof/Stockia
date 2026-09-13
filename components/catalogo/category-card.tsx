"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategoryFormDialog } from "@/components/catalogo/category-form-dialog";
import { updateCategory, deleteCategory } from "@/lib/actions/catalogo";
import type { Category } from "@/lib/supabase/types";

interface CategoryCardProps {
  category: Category;
  productCount: number;
}

export function CategoryCard({ category, productCount }: CategoryCardProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const boundUpdate = updateCategory.bind(null, category.id);

  async function handleDelete() {
    setDeleting(true);
    await deleteCategory(category.id, category.name);
    setDeleting(false);
    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <Card className="group relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-md">
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label="Editar categoría"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmOpen(true)}
            aria-label="Eliminar categoría"
          >
            <Trash2 className="h-4 w-4 text-brand-danger" />
          </Button>
        </div>

        <Link href={`/dashboard/catalogo/${category.id}`} className="flex flex-col gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-brand-md)] text-2xl"
            style={{ backgroundColor: `${category.color}22` }}
          >
            {category.icon}
          </div>
          <div>
            <p className="font-medium text-brand-ink">{category.name}</p>
            <p className="text-sm text-brand-muted">
              {productCount} producto{productCount === 1 ? "" : "s"}
            </p>
          </div>
        </Link>
      </Card>

      <CategoryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        category={category}
        action={boundUpdate}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Eliminar categoría"
        description={
          productCount > 0
            ? `Esta categoría tiene ${productCount} producto${productCount === 1 ? "" : "s"} que también se eliminarán. Esta acción no se puede deshacer.`
            : "Esta acción no se puede deshacer. ¿Deseas eliminar esta categoría?"
        }
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
