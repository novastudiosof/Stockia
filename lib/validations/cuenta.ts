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
});

export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_FILE_SIZE_MB = 3;

export const themeColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .nullable();
