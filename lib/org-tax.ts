import { createClient } from "@/lib/supabase/server";
import { NO_TAX, type TaxSettings } from "@/lib/tax";

/** Configuración de impuestos del negocio (si la migración 023 no está, queda apagado). */
export async function getTaxSettings(organizationId: string): Promise<TaxSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("tax_enabled, prices_include_tax")
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) return NO_TAX;
  return {
    taxEnabled: Boolean(data.tax_enabled),
    pricesIncludeTax: data.prices_include_tax !== false,
  };
}
