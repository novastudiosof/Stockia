import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const supplierSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre del proveedor es obligatorio").max(160),
  nit: optionalText(40),
  telefono: optionalText(30),
  email: optionalText(160).refine(
    (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Correo inválido"
  ),
  direccion: optionalText(200),
  notas: optionalText(300),
});

const money = z.coerce.number().min(0, "Los valores no pueden ser negativos").max(9_999_999_999);

export const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int("La cantidad debe ser un número entero").positive("La cantidad debe ser mayor a cero").max(1_000_000),
  unitCost: money,
  salePrice: money.optional(),
});

export const purchaseSchema = z.object({
  supplierId: z.string().uuid().optional(),
  invoiceNumber: optionalText(60),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  items: z.array(purchaseItemSchema).min(1, "Agrega al menos un producto").max(300),
  payment: z.discriminatedUnion("type", [
    z.object({ type: z.literal("contado"), source: z.enum(["caja", "externo"]) }),
    z.object({ type: z.literal("credito"), days: z.coerce.number().int().min(0).max(365) }),
  ]),
  notes: optionalText(300),
});

export const supplierPaymentSchema = z.object({
  purchaseId: z.string().uuid(),
  amount: z.coerce.number().positive("El pago debe ser mayor a cero").max(9_999_999_999),
  source: z.enum(["caja", "externo"]),
  notes: optionalText(200),
});

/** Producto nuevo creado desde la pantalla de compra (stock inicial 0). */
export const purchaseProductSchema = z.object({
  categoryId: z.string().uuid("Elige la categoría"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  barcode: optionalText(64),
  unitCost: money,
  salePrice: money,
  tax: z.string().optional(),
});
