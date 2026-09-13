import { z } from "zod";

export const saleItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
});

export const saleInputSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, "El carrito está vacío"),
});
