import { z } from "zod";

export const clienteSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  tipoDocumento: z.enum(["", "CC", "NIT", "CE", "TI", "PAS", "RC", "DIE"]).optional(),
  documento: z.string().trim().max(40).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Correo inválido"),
  direccion: z.string().trim().max(200).optional().or(z.literal("")),
});

// Vacío = sin valor (z.coerce.number() convertiría "" en 0).
const blankToUndefined = (v: unknown) =>
  v === "" || v == null ? undefined : typeof v === "string" ? v.replace(/[.\s$]/g, "") : v;

/** Cupo y plazo del fiado (solo los edita el administrador). */
export const clienteCreditSchema = z.object({
  creditLimit: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, "El cupo no puede ser negativo").max(9_999_999_999).optional()
  ),
  creditDays: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int("El plazo debe ser un número entero de días")
      .min(0, "El plazo no puede ser negativo")
      .max(365, "El plazo máximo es de 365 días")
      .optional()
  ),
});

const abonoAmount = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/[.\s$]/g, "") : v),
  z.coerce.number().positive("El abono debe ser mayor a cero").max(9_999_999_999)
);

export const abonoSchema = z.object({
  customerId: z.string().uuid(),
  amount: abonoAmount,
  method: z.enum(["efectivo", "nequi", "daviplata", "llave", "tarjeta", "otro"], {
    message: "Elige el medio de pago del abono",
  }),
  saleId: z.string().uuid().optional(),
  notes: z.string().trim().max(200).optional().or(z.literal("")),
});
