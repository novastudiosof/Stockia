import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/supabase/types";

export async function GET() {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("name", { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");

  sheet.columns = [
    { header: "Categoría", key: "categoria", width: 24 },
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio compra", key: "precioCompra", width: 16 },
    { header: "Precio venta", key: "precioVenta", width: 16 },
    { header: "Descripción", key: "descripcion", width: 30 },
    { header: "Código de barras", key: "codigoBarras", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  const firstCategory = ((categories as Category[]) ?? [])[0]?.name ?? "Mi categoría";
  sheet.addRow({
    categoria: firstCategory,
    nombre: "Producto de ejemplo",
    cantidad: 10,
    precioCompra: 1000,
    precioVenta: 1500,
    descripcion: "",
    codigoBarras: "",
  });

  const categoriesSheet = workbook.addWorksheet("Categorías existentes");
  categoriesSheet.columns = [{ header: "Categoría", key: "nombre", width: 30 }];
  categoriesSheet.getRow(1).font = { bold: true };
  for (const category of (categories as Category[]) ?? []) {
    categoriesSheet.addRow({ nombre: category.name });
  }
  if (!categories || categories.length === 0) {
    categoriesSheet.addRow({ nombre: "(Aún no tienes categorías — crea una primero)" });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
