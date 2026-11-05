"use client";

import * as React from "react";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { BulkImportDialog } from "@/components/catalogo/bulk-import-dialog";

interface ImportProductsButtonProps {
  categoryId: string;
  categoryName: string;
}

export function ImportProductsButton({ categoryId, categoryName }: ImportProductsButtonProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Importar Excel
      </Button>
      <BulkImportDialog
        open={open}
        onOpenChange={setOpen}
        categoryId={categoryId}
        categoryName={categoryName}
      />
    </>
  );
}
