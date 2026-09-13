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

export const productSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  quantity: z.coerce.number().int().min(0, "La cantidad no puede ser negativa"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  purchasePrice: z.coerce.number().min(0, "El precio de compra no puede ser negativo"),
  salePrice: z.coerce.number().min(0, "El precio de venta no puede ser negativo"),
});
