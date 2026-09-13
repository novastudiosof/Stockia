import { z } from "zod";

export const invoiceSchema = z.object({
  provider: z.string().trim().min(1, "El proveedor es obligatorio").max(120),
  invoiceNumber: z.string().trim().min(1, "El número de factura es obligatorio").max(60),
  amount: z.coerce.number().min(0, "El monto no puede ser negativo"),
  occurredAt: z.string().trim().min(1, "La fecha es obligatoria"),
});

export const ALLOWED_INVOICE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

export const MAX_INVOICE_FILE_SIZE_MB = 10;
