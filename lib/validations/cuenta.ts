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
