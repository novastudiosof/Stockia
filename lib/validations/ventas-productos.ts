import { z } from "zod";

export const saleItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
});

export const newCustomerInputSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre del cliente es obligatorio").max(120),
  documento: z.string().trim().max(40).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().max(160).optional().or(z.literal("")),
  direccion: z.string().trim().max(200).optional().or(z.literal("")),
});

export const saleInputSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, "El carrito está vacío"),
  customerId: z.string().uuid().optional(),
  customerData: newCustomerInputSchema.optional(),
});
