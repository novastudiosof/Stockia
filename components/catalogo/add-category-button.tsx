"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CategoryFormDialog } from "@/components/catalogo/category-form-dialog";
import { createCategory } from "@/lib/actions/catalogo";

export function AddCategoryButton() {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Agregar categoría
      </Button>
      <CategoryFormDialog open={open} onOpenChange={setOpen} action={createCategory} />
    </>
  );
}
