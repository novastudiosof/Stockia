import { z } from "zod";

export const changePasswordSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const createAuxiliarSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9._-]+$/, "Solo minúsculas, números, punto, guion y guion bajo"),
  fullName: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

// Campo numerico opcional: vacio = sin valor (z.coerce.number() convertiria "" en 0).
const optionalInt = () =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(999999999).optional()
  );

export const invoiceSettingsSchema = z.object({
  legalName: z.string().trim().max(160).optional().or(z.literal("")),
  taxId: z.string().trim().max(40).optional().or(z.literal("")),
  billingAddress: z.string().trim().max(200).optional().or(z.literal("")),
  billingPhone: z.string().trim().max(30).optional().or(z.literal("")),
  billingEmail: z.string().trim().max(160).optional().or(z.literal("")),
  invoiceFooter: z.string().trim().max(300).optional().or(z.literal("")),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Usa un código de moneda de 3 letras (ej: COP, USD)"),
  invoicePrefix: z.string().trim().max(12).optional().or(z.literal("")),
  taxEnabled: z.boolean(),
  pricesIncludeTax: z.boolean(),
  taxDv: z.string().trim().max(2).optional().or(z.literal("")),
  taxRegime: z.string().trim().max(60).optional().or(z.literal("")),
  billingCity: z.string().trim().max(80).optional().or(z.literal("")),
  taxResponsibilities: z.string().trim().max(200).optional().or(z.literal("")),
  resolutionNumber: z.string().trim().max(40).optional().or(z.literal("")),
  resolutionFrom: optionalInt(),
  resolutionTo: optionalInt(),
  resolutionValidUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de vigencia inválida")
    .optional()
    .or(z.literal("")),
});

export const paymentSettingsSchema = z.object({
  methods: z.array(z.enum(["nequi", "daviplata", "llave", "tarjeta", "otro", "credito"])),
  otherLabel: z
    .string()
    .trim()
    .min(1, "Escribe el nombre del medio de pago \"Otro\"")
    .max(30, "El nombre del medio \"Otro\" es muy largo (máx. 30)"),
  defaultCreditDays: z.coerce
    .number()
    .int("El plazo debe ser un número entero de días")
    .min(0, "El plazo no puede ser negativo")
    .max(365, "El plazo máximo es de 365 días"),
  maxDiscountPct: z.coerce
    .number()
    .min(0, "El descuento máximo no puede ser negativo")
    .max(100, "El descuento máximo no puede pasar del 100%"),
});

export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_FILE_SIZE_MB = 3;

export const themeColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable();
