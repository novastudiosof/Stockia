// Impuestos (IVA / impuesto al consumo). El cálculo OFICIAL lo hace create_sale()
// en la base de datos; estas funciones lo replican para mostrar el total en
// pantalla antes de confirmar y deben dar el mismo resultado.

export type TaxKind = "iva" | "consumo" | "exento" | "excluido";

export type TaxOption = {
  /** Valor que viaja en el formulario: "<tipo>:<tarifa>". */
  value: string;
  label: string;
  kind: TaxKind;
  rate: number;
};

export const TAX_OPTIONS: TaxOption[] = [
  { value: "excluido:0", label: "Sin impuesto (excluido)", kind: "excluido", rate: 0 },
  { value: "exento:0", label: "Exento (0%)", kind: "exento", rate: 0 },
  { value: "iva:5", label: "IVA 5%", kind: "iva", rate: 5 },
  { value: "iva:19", label: "IVA 19%", kind: "iva", rate: 19 },
  { value: "consumo:4", label: "Impuesto al consumo 4%", kind: "consumo", rate: 4 },
  { value: "consumo:8", label: "Impuesto al consumo 8%", kind: "consumo", rate: 8 },
  { value: "consumo:16", label: "Impuesto al consumo 16%", kind: "consumo", rate: 16 },
];

export function taxOptionValue(kind: string | null | undefined, rate: number | null | undefined) {
  return `${kind ?? "excluido"}:${Number(rate ?? 0)}`;
}

export function parseTaxOption(value: unknown): { kind: TaxKind; rate: number } | null {
  const option = TAX_OPTIONS.find((o) => o.value === value);
  return option ? { kind: option.kind, rate: option.rate } : null;
}

export function taxLabel(kind: string | null | undefined, rate: number | null | undefined) {
  const found = TAX_OPTIONS.find((o) => o.value === taxOptionValue(kind, rate));
  return found?.label ?? "Sin impuesto (excluido)";
}

export type TaxSettings = {
  taxEnabled: boolean;
  pricesIncludeTax: boolean;
};

export const NO_TAX: TaxSettings = { taxEnabled: false, pricesIncludeTax: true };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type LineTax = {
  /** Valor de la línea que paga el cliente (con impuesto). */
  total: number;
  base: number;
  tax: number;
  rate: number;
};

/** Impuesto de una línea (precio unitario × cantidad) según la configuración del negocio. */
export function computeLineTax(
  unitPrice: number,
  quantity: number,
  taxRate: number | null | undefined,
  settings: TaxSettings
): LineTax {
  const rate = settings.taxEnabled ? Number(taxRate ?? 0) : 0;
  if (rate > 0 && settings.pricesIncludeTax) {
    const total = round2(unitPrice * quantity);
    const tax = round2((total * rate) / (100 + rate));
    return { total, base: round2(total - tax), tax, rate };
  }
  if (rate > 0) {
    const base = round2(unitPrice * quantity);
    const tax = round2((base * rate) / 100);
    return { total: round2(base + tax), base, tax, rate };
  }
  const total = round2(unitPrice * quantity);
  return { total, base: total, tax: 0, rate: 0 };
}

/** Precio final de UNA unidad (lo que paga el cliente), para mostrar en catálogo. */
export function finalUnitPrice(
  unitPrice: number,
  taxRate: number | null | undefined,
  settings: TaxSettings
) {
  return computeLineTax(unitPrice, 1, taxRate, settings).total;
}

export type TaxSummaryRow = { label: string; base: number; tax: number };

/** Resume una lista de ítems de venta por tipo de impuesto y tarifa. */
export function summarizeTaxes(
  items: { taxKind?: string | null; taxRate?: number | null; base?: number | null; tax?: number | null }[]
): TaxSummaryRow[] {
  const map = new Map<string, TaxSummaryRow>();
  for (const item of items) {
    const rate = Number(item.taxRate ?? 0);
    if (!item.taxKind || rate <= 0) continue;
    const key = `${item.taxKind}:${rate}`;
    const row = map.get(key) ?? {
      label: item.taxKind === "iva" ? `IVA ${rate}%` : `Imp. consumo ${rate}%`,
      base: 0,
      tax: 0,
    };
    row.base += Number(item.base ?? 0);
    row.tax += Number(item.tax ?? 0);
    map.set(key, row);
  }
  return [...map.values()];
}
