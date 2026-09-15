"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import {
  categorySchema,
  productSchema,
  productUpdateSchema,
  stockAdjustmentSchema,
  bulkImportRowSchema,
  MAX_IMPORT_FILE_SIZE_MB,
} from "@/lib/validations/catalogo";

type ActionResult = { error?: string } | void;

export async function createCategory(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede crear categorías" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "📦",
    color: formData.get("color") || "#F59E0B",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

  const [{ data: org }, { count }] = await Promise.all([
    supabase
      .from("organizations")
      .select("max_categorias")
      .eq("id", profile.organization_id)
      .single(),
    supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", profile.organization_id),
  ]);
  if (org && (count ?? 0) >= org.max_categorias) {
    return { error: `Alcanzaste el máximo de ${org.max_categorias} categorías de tu plan` };
  }

  const { error } = await supabase.from("categories").insert({
    organization_id: profile.organization_id,
    name: parsed.data.name,
    icon: parsed.data.icon,
    color: parsed.data.color,
  });
  if (error) return { error: friendlyDbError(error, "createCategory", "No se pudo crear la categoría") };

  await logActivity(profile, "Creó categoría", parsed.data.name);
  revalidatePath("/dashboard/catalogo");
}

export async function updateCategory(
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar categorías" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "📦",
    color: formData.get("color") || "#F59E0B",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", categoryId);
  if (error) return { error: friendlyDbError(error, "updateCategory", "No se pudo actualizar la categoría") };

  await logActivity(profile, "Editó categoría", parsed.data.name);
  revalidatePath("/dashboard/catalogo");
}

export async function deleteCategory(categoryId: string, categoryName: string) {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede eliminar categorías" };
  const supabase = await createClient();

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return { error: friendlyDbError(error, "deleteCategory", "No se pudo eliminar la categoría") };

  await logActivity(profile, "Eliminó categoría", categoryName);
  revalidatePath("/dashboard/catalogo");
}

export async function createProduct(
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede crear productos" };

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    description: formData.get("description") ?? "",
    purchasePrice: formData.get("purchasePrice"),
    salePrice: formData.get("salePrice"),
    barcode: formData.get("barcode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

  // create_product() valida el límite de productos por categoría, inserta
  // el producto y registra su movimiento de stock inicial en una sola
  // transacción atómica (evita tanto la carrera de dos altas simultáneas en
  // una categoría casi llena, como el riesgo de que el producto quede creado
  // sin su registro en stock_movements si un segundo insert fallara aparte).
  const { data: product, error } = await supabase
    .rpc("create_product", {
      p_organization_id: profile.organization_id,
      p_category_id: categoryId,
      p_name: parsed.data.name,
      p_quantity: parsed.data.quantity,
      p_description: parsed.data.description || "",
      p_purchase_price: parsed.data.purchasePrice,
      p_sale_price: parsed.data.salePrice,
      p_barcode: parsed.data.barcode || "",
    })
    .single();
  if (error || !product) {
    return {
      error: friendlyDbError(error, "createProduct", "No se pudo crear el producto", {
        "23505": "Ya existe un producto con ese código de barras",
      }),
    };
  }

  await logActivity(profile, "Creó producto", parsed.data.name);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
  revalidatePath("/dashboard/catalogo");
}

export async function updateProduct(
  productId: string,
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede editar productos" };

  const parsed = productUpdateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    purchasePrice: formData.get("purchasePrice"),
    salePrice: formData.get("salePrice"),
    barcode: formData.get("barcode") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      purchase_price: parsed.data.purchasePrice,
      sale_price: parsed.data.salePrice,
      barcode: parsed.data.barcode || null,
    })
    .eq("id", productId);
  if (error) {
    return {
      error: friendlyDbError(error, "updateProduct", "No se pudo actualizar el producto", {
        "23505": "Ya existe un producto con ese código de barras",
      }),
    };
  }

  await logActivity(profile, "Editó producto", parsed.data.name);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
}

export async function deleteProduct(
  productId: string,
  categoryId: string,
  productName: string
) {
  const profile = await requireProfile();
  if (profile.role !== "owner") return { error: "Solo el administrador puede eliminar productos" };
  const supabase = await createClient();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { error: friendlyDbError(error, "deleteProduct", "No se pudo eliminar el producto") };

  await logActivity(profile, "Eliminó producto", productName);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
  revalidatePath("/dashboard/catalogo");
}

type AdjustStockResult = { error?: string; newQuantity?: number };

export async function adjustStock(
  productId: string,
  categoryId: string,
  delta: number,
  reason: string
): Promise<AdjustStockResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede ajustar el stock" };

  const parsed = stockAdjustmentSchema.safeParse({ delta, reason });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_organization_id: profile.organization_id,
    p_product_id: productId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });
  if (error) return { error: friendlyDbError(error, "adjustStock", "No se pudo ajustar el stock") };

  await logActivity(
    profile,
    "Ajustó stock",
    `${parsed.data.delta > 0 ? "+" : ""}${parsed.data.delta} (motivo: ${parsed.data.reason})`
  );
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
  return { newQuantity: data as number };
}

export type BulkImportRowError = { row: number; field: string; message: string };
type BulkImportResult = {
  error?: string;
  rowErrors?: BulkImportRowError[];
  insertedCount?: number;
};

const IMPORT_COLUMNS = [
  "categoria",
  "nombre",
  "cantidad",
  "precioCompra",
  "precioVenta",
  "descripcion",
  "codigoBarras",
] as const;

export async function bulkImportProducts(formData: FormData): Promise<BulkImportResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };
  if (profile.role !== "owner") return { error: "Solo el administrador puede importar productos" };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Selecciona un archivo Excel (.xlsx)" };
  if (file.size > MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024) {
    return { error: `El archivo no puede superar ${MAX_IMPORT_FILE_SIZE_MB}MB` };
  }

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", profile.organization_id);

  const categoryByName = new Map(
    (categories ?? []).map((c) => [c.name.trim().toLowerCase(), c.id as string])
  );

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { error: "No se pudo leer el archivo. Verifica que sea un .xlsx válido" };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "El archivo no tiene hojas" };

  const rowErrors: BulkImportRowError[] = [];
  const items: {
    categoryId: string;
    name: string;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    description: string;
    barcode: string;
  }[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado

    const values = row.values as unknown[];
    const raw = {
      categoria: String(values[1] ?? "").trim(),
      nombre: String(values[2] ?? "").trim(),
      cantidad: values[3],
      precioCompra: values[4],
      precioVenta: values[5],
      descripcion: String(values[6] ?? "").trim(),
      codigoBarras: String(values[7] ?? "").trim(),
    };

    if (!raw.categoria && !raw.nombre) return; // fila vacía, se ignora

    const parsed = bulkImportRowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = IMPORT_COLUMNS.includes(issue.path[0] as (typeof IMPORT_COLUMNS)[number])
          ? String(issue.path[0])
          : "fila";
        rowErrors.push({ row: rowNumber, field, message: issue.message });
      }
      return;
    }

    const categoryId = categoryByName.get(parsed.data.categoria.toLowerCase());
    if (!categoryId) {
      rowErrors.push({
        row: rowNumber,
        field: "categoria",
        message: `La categoría "${parsed.data.categoria}" no existe en tu catálogo`,
      });
      return;
    }

    items.push({
      categoryId,
      name: parsed.data.nombre,
      quantity: parsed.data.cantidad,
      purchasePrice: parsed.data.precioCompra,
      salePrice: parsed.data.precioVenta,
      description: parsed.data.descripcion,
      barcode: parsed.data.codigoBarras,
    });
  });

  if (rowErrors.length > 0) {
    return { rowErrors };
  }
  if (items.length === 0) {
    return { error: "El archivo no tiene productos para importar" };
  }

  const { data, error } = await supabase.rpc("bulk_import_products", {
    p_organization_id: profile.organization_id,
    p_items: items,
  });
  if (error) {
    return {
      error: friendlyDbError(error, "bulkImportProducts", "No se pudo importar los productos", {
        "23505": "Uno de los códigos de barras del archivo ya está en uso",
      }),
    };
  }

  await logActivity(profile, "Importó productos", `${items.length} productos`);
  revalidatePath("/dashboard/catalogo");
  return { insertedCount: (data as number) ?? items.length };
}
