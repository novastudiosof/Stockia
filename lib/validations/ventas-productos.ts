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

const amount = z.coerce.number().min(0, "Los montos no pueden ser negativos");

export const paymentInputSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("efectivo") }),
  z.object({
    method: z.literal("transferencia"),
    channel: z.enum(["nequi", "daviplata", "llave"], {
      message: "Indica si la transferencia fue por Nequi, Daviplata o Llave",
    }),
  }),
  z.object({
    method: z.literal("mixto"),
    efectivo: amount,
    nequi: amount,
    daviplata: amount,
    llave: amount,
  }),
]);

export const customerEmailSchema = z
  .string()
  .trim()
  .max(160)
  .email("El correo del cliente no es válido")
  .optional()
  .or(z.literal(""));

export const saleInputSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, "El carrito está vacío"),
  payment: paymentInputSchema.default({ method: "efectivo" }),
  customerEmail: customerEmailSchema,
  customerId: z.string().uuid().optional(),
  customerData: newCustomerInputSchema.optional(),
});
