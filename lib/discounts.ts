// Descuentos de la venta. El cálculo OFICIAL lo hace create_sale() en la base
// de datos (sql/025_descuentos.sql); esta función lo replica para mostrar el
// total en el carrito antes de confirmar. Deben dar exactamente lo mismo: el
// pago mixto tiene que sumar el total del servidor.

import { computeLineTax, type TaxSettings } from "@/lib/tax";

export type DiscountType = "pct" | "amount";

export type DiscountInput = { type: DiscountType; value: number };

export type SaleLineInput = {
  unitPrice: number;
  quantity: number;
  taxRate: number | null | undefined;
  taxKind?: string | null;
  discount?: DiscountInput | null;
};

export type SaleLineResult = {
  /** Valor de la línea antes de descuentos (con impuesto). */
  gross: number;
  /** Descuento propio de la línea. */
  lineDiscount: number;
  /** Descuento total de la línea (propio + su parte del de la venta). */
  discount: number;
  /** Lo que se cobra por la línea. */
  total: number;
  base: number;
  tax: number;
  rate: number;
  taxKind?: string | null;
};

export type SaleTotals = {
  lines: SaleLineResult[];
  gross: number;
  lineDiscounts: number;
  globalDiscount: number;
  discountTotal: number;
  total: number;
  taxTotal: number;
  /** Mensaje si algún descuento no es válido (el servidor también lo rechaza). */
  error: string | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Redondeo a pesos enteros, igual que round() de Postgres para positivos. */
const round0 = (n: number) => Math.round(n + 1e-9);

function discountAmount(base: number, discount: DiscountInput | null | undefined): number {
  if (!discount || !(discount.value > 0)) return 0;
  return discount.type === "pct" ? round0((base * discount.value) / 100) : round0(discount.value);
}

export function computeSaleTotals(
  inputs: SaleLineInput[],
  settings: TaxSettings,
  globalDiscount?: DiscountInput | null
): SaleTotals {
  let error: string | null = null;

  const first = inputs.map((input) => {
    const t = computeLineTax(input.unitPrice, input.quantity, input.taxRate, settings);
    if (input.discount?.type === "pct" && input.discount.value > 100) {
      error = "Un descuento no puede pasar del 100%";
    }
    const ld = discountAmount(t.total, input.discount);
    if (ld > t.total) error = "Un descuento supera el valor de su producto";
    const lineDiscount = Math.min(ld, t.total);
    return { t, ld: lineDiscount, net: round2(t.total - lineDiscount), taxKind: input.taxKind };
  });

  const gross = round2(first.reduce((sum, l) => sum + l.t.total, 0));
  const lineDiscounts = round2(first.reduce((sum, l) => sum + l.ld, 0));
  const netSum = round2(gross - lineDiscounts);

  if (globalDiscount?.type === "pct" && globalDiscount.value > 100) {
    error = "El descuento de la venta no puede pasar del 100%";
  }
  let global = discountAmount(netSum, globalDiscount);
  if (global > netSum) {
    error = "El descuento de la venta supera su valor";
    global = netSum;
  }

  // La línea de mayor valor (la primera si hay empate) se queda con el redondeo.
  let holder = 0;
  first.forEach((l, i) => {
    if (l.net > first[holder].net) holder = i;
  });
  const share = (i: number) => (netSum > 0 ? round2((global * first[i].net) / netSum) : 0);
  let shares = 0;
  if (global > 0) first.forEach((_, i) => i !== holder && (shares = round2(shares + share(i))));

  const lines = first.map((l, i) => {
    const s = global === 0 ? 0 : i === holder ? round2(global - shares) : share(i);
    const total = round2(l.net - s);
    const discount = round2(l.ld + s);
    let base = l.t.base;
    let tax = l.t.tax;
    if (discount > 0) {
      tax = l.t.rate > 0 ? round2((total * l.t.rate) / (100 + l.t.rate)) : 0;
      base = round2(total - tax);
    }
    return {
      gross: l.t.total,
      lineDiscount: l.ld,
      discount,
      total,
      base,
      tax,
      rate: l.t.rate,
      taxKind: l.taxKind,
    };
  });

  return {
    lines,
    gross,
    lineDiscounts,
    globalDiscount: global,
    discountTotal: round2(lineDiscounts + global),
    total: round2(lines.reduce((sum, l) => sum + l.total, 0)),
    taxTotal: round2(lines.reduce((sum, l) => sum + l.tax, 0)),
    error,
  };
}

/** Porcentaje de descuento de la venta sobre su valor antes de descuentos. */
export function discountPct(totals: Pick<SaleTotals, "gross" | "discountTotal">): number {
  return totals.gross > 0 ? (totals.discountTotal * 100) / totals.gross : 0;
}
