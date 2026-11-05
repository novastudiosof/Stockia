import type { Sale } from "@/lib/supabase/types";

type PaymentFields = Pick<
  Sale,
  "payment_method" | "pay_cash" | "pay_nequi" | "pay_daviplata" | "pay_llave"
>;

/** Partes del pago con monto mayor a 0. */
export function paymentParts(sale: PaymentFields) {
  return [
    { label: "Efectivo", amount: Number(sale.pay_cash) },
    { label: "Nequi", amount: Number(sale.pay_nequi) },
    { label: "Daviplata", amount: Number(sale.pay_daviplata) },
    { label: "Llave", amount: Number(sale.pay_llave) },
  ].filter((part) => part.amount > 0);
}

/** Texto corto: Efectivo, Transferencia · Nequi o Mixto. */
export function paymentLabel(sale: PaymentFields): string {
  if (sale.payment_method === "efectivo") return "Efectivo";
  if (sale.payment_method === "mixto") return "Mixto";
  const channel = paymentParts(sale).find((part) => part.label !== "Efectivo");
  return channel ? `Transferencia · ${channel.label}` : "Transferencia";
}

/** Detalle largo para facturas, por ejemplo: Efectivo $20.000 + Nequi $10.000. */
export function paymentDetail(sale: PaymentFields, format: (n: number) => string): string {
  return paymentParts(sale)
    .map((part) => `${part.label} ${format(part.amount)}`)
    .join(" + ");
}
