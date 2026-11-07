import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { ModuleDef, OrganizationModule } from "@/lib/supabase/types";

export const MODULE_KEYS = {
  VENTAS_GASTOS: "ventas_gastos",
  FACTURAS: "facturas",
  VENTAS_PRODUCTOS: "ventas_productos",
  CLIENTES: "clientes",
  INFORMES: "informes",
  ACTIVIDAD: "actividad",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

export interface ModuleStatus extends ModuleDef {
  enabled: boolean;
}

export async function getModulesWithStatus(
  organizationId: string
): Promise<ModuleStatus[]> {
  const supabase = await createClient();

  const [{ data: modules }, { data: orgModules }] = await Promise.all([
    supabase.from("modules").select("*").order("name"),
    supabase
      .from("organization_modules")
      .select("*")
      .eq("organization_id", organizationId),
  ]);

  const enabledByModuleId = new Map(
    ((orgModules as OrganizationModule[]) ?? []).map((row) => [
      row.module_id,
      row.enabled,
    ])
  );

  return ((modules as ModuleDef[]) ?? []).map((mod) => ({
    ...mod,
    enabled: enabledByModuleId.get(mod.id) ?? false,
  }));
}

type EnabledRow = { enabled: boolean; modules: { key: string } | { key: string }[] | null };

/**
 * Claves de los módulos habilitados de una organización, en UNA consulta.
 * cache(): el layout y la página de una misma petición la comparten.
 */
export const getEnabledModuleKeys = cache(async function getEnabledModuleKeys(
  organizationId: string
): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_modules")
    .select("enabled, modules(key)")
    .eq("organization_id", organizationId)
    .eq("enabled", true);

  const keys = new Set<string>();
  for (const row of (data as unknown as EnabledRow[] | null) ?? []) {
    const mod = Array.isArray(row.modules) ? row.modules[0] : row.modules;
    if (row.enabled && mod?.key) keys.add(mod.key);
  }
  return keys;
});

export async function isModuleEnabled(organizationId: string, key: ModuleKey): Promise<boolean> {
  return (await getEnabledModuleKeys(organizationId)).has(key);
}

/**
 * Corta la ejecución (server component o route handler) si el módulo no
 * está habilitado para la organización. Debe llamarse en cada página y en
 * cada server action/route handler que mute datos del módulo — el gating
 * del lado del cliente (ocultar el link en el menú) es solo cosmético.
 */
export async function requireModule(
  organizationId: string,
  key: ModuleKey,
  redirectTo = "/dashboard/modulos"
) {
  const enabled = await isModuleEnabled(organizationId, key);
  if (!enabled) redirect(redirectTo);
}
