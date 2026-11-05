import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/supabase/types";

export async function GET(request: Request) {
  const profile = await requireProfile();
  if (!profile.organization_id || profile.role !== "owner") {
    return new Response("No autorizado", { status: 403 });
  }

  const categoryId = new URL(request.url).searchParams.get("categoria") || "";
  const supabase = await createClient();
  const { data: category } = await supabase
    .from("categories")
    .select("*")
    .eq("id", categoryId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();
  if (!category) return new Response("Categoría no encontrada", { status: 404 });
  const categoryName = (category as Category).name;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Productos");

  sheet.columns = [
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Precio compra", key: "precioCompra", width: 16 },
    { header: "Precio venta", key: "precioVenta", width: 16 },
    { header: "Descripción", key: "descripcion", width: 30 },
    { header: "Código de barras", key: "codigoBarras", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    nombre: "Producto de ejemplo",
    cantidad: 10,
    precioCompra: 1000,
    precioVenta: 1500,
    descripcion: "",
    codigoBarras: "",
  });

  const info = workbook.addWorksheet("Instrucciones");
  info.columns = [{ header: "Instrucciones", key: "texto", width: 90 }];
  info.getRow(1).font = { bold: true };
  info.addRow({ texto: `Estos productos se importarán a la categoría: ${categoryName}` });
  info.addRow({ texto: "Borra la fila de ejemplo y escribe un producto por fila en la hoja Productos." });
  info.addRow({ texto: "Obligatorios: Nombre, Cantidad, Precio compra y Precio venta. Descripción y Código de barras son opcionales." });

  const buffer = await workbook.xlsx.writeBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
