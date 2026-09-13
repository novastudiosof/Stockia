import { z } from "zod";

export const movementSchema = z.object({
  type: z.enum(["venta", "gasto"]),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  occurredAt: z.string().trim().min(1, "La fecha es obligatoria"),
});
