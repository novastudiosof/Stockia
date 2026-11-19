import { z } from "zod";

export const discountInputSchema = z
  .object({
    type: z.enum(["pct", "amount"]),
    value: z.coerce.number().min(0, "El descuento no puede ser negativo").max(9_999_999_999),
  })
  .refine((d) => d.type !== "pct" || d.value <= 100, "Un descuento no puede pasar del 100%");

export const saleItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  discountType: z.enum(["pct", "amount"]).optional(),
  discountValue: z.coerce.number().min(0, "El descuento no puede ser negativo").max(9_999_999_999).optional(),
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
  z.object({ method: z.literal("tarjeta") }),
  z.object({ method: z.literal("otro") }),
  z.object({ method: z.literal("credito") }),
  z.object({
    method: z.literal("mixto"),
    efectivo: amount,
    nequi: amount,
    daviplata: amount,
    llave: amount,
    tarjeta: amount.default(0),
    otro: amount.default(0),
    credito: amount.default(0),
  }),
]);

/** true si la venta deja algo fiado (todo, o una parte en pago mixto). */
export function usesCredit(payment: z.infer<typeof paymentInputSchema>): boolean {
  return payment.method === "credito" || (payment.method === "mixto" && payment.credito > 0);
}

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
  discount: discountInputSchema.optional(),
});
