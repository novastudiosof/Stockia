import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80),
  icon: z.string().trim().min(1).max(8).default("📦"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .default("#F59E0B"),
});

const barcodeField = z.string().trim().max(64).optional().or(z.literal(""));

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  quantity: z.coerce.number().int().min(0, "La cantidad no puede ser negativa"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  purchasePrice: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  salePrice: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
  barcode: barcodeField,
});

// Al editar un producto ya no se puede sobrescribir la cantidad a mano: se
// usa stockAdjustmentSchema (con motivo obligatorio) a través de adjustStock.
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  purchasePrice: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  salePrice: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
  barcode: barcodeField,
});

export const stockAdjustmentSchema = z.object({
  delta: z.coerce.number().int().refine((v) => v !== 0, "El ajuste debe ser distinto de cero"),
  reason: z.string().trim().min(3, "Escribe un motivo (mínimo 3 caracteres)").max(240),
});

export const bulkImportRowSchema = z.object({
  categoria: z.string().trim().min(1, "La categoría es obligatoria").max(80),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  cantidad: z.coerce.number().int().min(0, "La cantidad no puede ser negativa"),
  precioCompra: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  precioVenta: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
  descripcion: z.string().trim().max(500),
  codigoBarras: z.string().trim().max(64),
});

export const MAX_IMPORT_FILE_SIZE_MB = 5;
