import type { AbonoMethod, OptionalPaymentKey, Organization, Sale } from "@/lib/supabase/types";

type PaymentFields = Pick<
  Sale,
  "payment_method" | "pay_cash" | "pay_nequi" | "pay_daviplata" | "pay_llave"
> &
  Partial<
    Pick<Sale, "pay_tarjeta" | "pay_otro" | "pay_otro_label" | "pay_credito" | "credit_due_date">
  >;

/** Medios que el negocio puede activar (el efectivo siempre está activo). */
export const OPTIONAL_PAYMENT_KEYS: OptionalPaymentKey[] = [
  "nequi",
  "daviplata",
  "llave",
  "tarjeta",
  "otro",
  "credito",
];

export const DEFAULT_PAYMENT_METHODS: OptionalPaymentKey[] = ["nequi", "daviplata", "llave"];

export type PaymentSettings = {
  /** Medios activos además del efectivo. */
  methods: OptionalPaymentKey[];
  /** Nombre del medio "Otro" (ej: Bold, Bono). */
  otherLabel: string;
  /** Plazo del fiado por defecto, en días. */
  defaultCreditDays: number;
  /** Descuento máximo que puede dar un auxiliar (% de la venta). */
  maxDiscountPct: number;
};

/** Configuración de pagos del negocio (si falta la migración 024, la de antes). */
export function paymentSettingsOf(org: Partial<Organization> | null | undefined): PaymentSettings {
  const methods = Array.isArray(org?.payment_methods)
    ? org.payment_methods.filter((m): m is OptionalPaymentKey =>
        OPTIONAL_PAYMENT_KEYS.includes(m as OptionalPaymentKey)
      )
    : DEFAULT_PAYMENT_METHODS;
  return {
    methods,
    otherLabel: org?.payment_other_label?.trim() || "Otro",
    defaultCreditDays: Number(org?.default_credit_days ?? 30),
    maxDiscountPct: Number(org?.max_discount_pct ?? 10),
  };
}

/** Nombre de cada medio, para pantallas e informes. */
export function methodLabel(method: AbonoMethod | OptionalPaymentKey | "efectivo", otherLabel = "Otro") {
  switch (method) {
    case "efectivo":
      return "Efectivo";
    case "nequi":
      return "Nequi";
    case "daviplata":
      return "Daviplata";
    case "llave":
      return "Llave";
    case "tarjeta":
      return "Tarjeta";
    case "otro":
      return otherLabel;
    case "credito":
      return "Fiado";
  }
}

/** Partes del pago con monto mayor a 0. */
export function paymentParts(sale: PaymentFields) {
  return [
    { label: "Efectivo", amount: Number(sale.pay_cash) },
    { label: "Nequi", amount: Number(sale.pay_nequi) },
    { label: "Daviplata", amount: Number(sale.pay_daviplata) },
    { label: "Llave", amount: Number(sale.pay_llave) },
    { label: "Tarjeta", amount: Number(sale.pay_tarjeta ?? 0) },
    { label: sale.pay_otro_label || "Otro", amount: Number(sale.pay_otro ?? 0) },
    { label: "Fiado", amount: Number(sale.pay_credito ?? 0) },
  ].filter((part) => part.amount > 0);
}

/** Texto corto: Efectivo, Transferencia · Nequi, Tarjeta, Fiado o Mixto. */
export function paymentLabel(sale: PaymentFields): string {
  switch (sale.payment_method) {
    case "efectivo":
      return "Efectivo";
    case "mixto":
      return "Mixto";
    case "tarjeta":
      return "Tarjeta";
    case "otro":
      return sale.pay_otro_label || "Otro";
    case "credito":
      return "Fiado";
    default: {
      const channel = paymentParts(sale).find((part) => part.label !== "Efectivo");
      return channel ? `Transferencia · ${channel.label}` : "Transferencia";
    }
  }
}

/** Detalle largo para facturas, por ejemplo: Efectivo $20.000 + Nequi $10.000. */
export function paymentDetail(sale: PaymentFields, format: (n: number) => string): string {
  return paymentParts(sale)
    .map((part) => `${part.label} ${format(part.amount)}`)
    .join(" + ");
}

const dueFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

/** Fecha de vencimiento del fiado (YYYY-MM-DD) en texto: 19 dic 2026. */
export function formatDueDate(day: string | null | undefined): string | null {
  if (!day) return null;
  return dueFormat.format(new Date(`${day}T12:00:00Z`));
}

/**
 * Texto del pago para la factura: el método (con el detalle si es mixto) y,
 * si hubo fiado, cuándo vence.
 */
export function paymentText(sale: PaymentFields, format: (n: number) => string): string {
  const base =
    sale.payment_method === "mixto" ? `Mixto (${paymentDetail(sale, format)})` : paymentLabel(sale);
  const credit = Number(sale.pay_credito ?? 0);
  const due = formatDueDate(sale.credit_due_date);
  if (credit > 0 && due) {
    return sale.payment_method === "credito"
      ? `Fiado, vence ${due}`
      : `${base} · Fiado ${format(credit)}, vence ${due}`;
  }
  return base;
}
