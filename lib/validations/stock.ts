import { z } from "zod";

export const MAX_MIN_STOCK = 100000;

/** Stock mínimo de un producto: vacío = usa el mínimo general del negocio. */
export const minStockField = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce
    .number()
    .int("El stock mínimo debe ser un número entero")
    .min(0, "El stock mínimo no puede ser negativo")
    .max(MAX_MIN_STOCK, "El stock mínimo es demasiado alto")
    .nullable()
);

export const stockAlertSettingsSchema = z.object({
  enabled: z.boolean(),
  defaultMinStock: z.coerce
    .number()
    .int("El mínimo general debe ser un número entero")
    .min(0, "El mínimo general no puede ser negativo")
    .max(MAX_MIN_STOCK, "El mínimo general es demasiado alto"),
});
