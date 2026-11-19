// Stock mínimo y alertas (migración 027). La lista oficial la calcula
// low_stock_products() en la base de datos; esto replica la misma regla para
// marcar los productos en pantalla.

export type StockSettings = {
  alertsEnabled: boolean;
  defaultMinStock: number;
};

export const DEFAULT_STOCK_SETTINGS: StockSettings = { alertsEnabled: true, defaultMinStock: 5 };

export type StockStatus = "agotado" | "bajo" | "ok";

export function effectiveMinStock(minStock: number | null | undefined, settings: StockSettings) {
  return minStock ?? settings.defaultMinStock;
}

/** Agotado: 0 o menos. Por agotarse: en el mínimo o por debajo. */
export function stockStatus(
  quantity: number,
  minStock: number | null | undefined,
  settings: StockSettings
): StockStatus {
  if (!settings.alertsEnabled) return "ok";
  if (quantity <= 0) return "agotado";
  return quantity <= effectiveMinStock(minStock, settings) ? "bajo" : "ok";
}

/** Cantidad que falta para llegar al mínimo (al menos 1 si está agotado o en el mínimo). */
export function suggestedOrder(quantity: number, minStock: number) {
  return Math.max(minStock - Math.max(quantity, 0), 1);
}
