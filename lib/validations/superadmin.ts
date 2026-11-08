import { z } from "zod";

import { BUSINESS_TYPE_KEYS } from "@/lib/business-types";

const businessTypeSchema = z
  .string()
  .refine((v) => (BUSINESS_TYPE_KEYS as string[]).includes(v), "Tipo de negocio inválido");

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "El nombre del negocio es obligatorio").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Mínimo 2 caracteres")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Solo minúsculas, números y guiones"),
  ownerFullName: z.string().trim().min(1, "El nombre del dueño es obligatorio").max(120),
  ownerUsername: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mínimo 3 caracteres")
    .max(32)
    .regex(/^[a-z0-9._-]+$/, "Solo minúsculas, números, punto, guion y guion bajo"),
  ownerPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  maxAuxiliares: z.coerce.number().int().min(0).max(50).default(1),
  businessType: businessTypeSchema.default("general"),
});

export const appearanceSchema = z.object({
  businessType: businessTypeSchema,
});
