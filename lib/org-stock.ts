import { createClient } from "@/lib/supabase/server";
import { DEFAULT_STOCK_SETTINGS, type StockSettings } from "@/lib/stock";

/** Alertas de stock del negocio (sin la migración 027 se usan los valores por defecto). */
export async function getStockSettings(organizationId: string): Promise<StockSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("stock_alerts_enabled, default_min_stock")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !data) return DEFAULT_STOCK_SETTINGS;
  return {
    alertsEnabled: data.stock_alerts_enabled !== false,
    defaultMinStock: Number(data.default_min_stock ?? DEFAULT_STOCK_SETTINGS.defaultMinStock),
  };
}
