"use server";

import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";

const BUCKET = process.env.SUPABASE_INVOICES_BUCKET || "invoices";

/**
 * Enlace temporal (5 min) a un archivo de factura. Con download=true el
 * navegador lo descarga en vez de abrirlo. La política del bucket impide
 * pedir archivos de otra organización.
 */
export async function getInvoiceFileUrl(filePath: string, download = false) {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  // Las rutas válidas empiezan por la carpeta de la propia organización.
  if (!filePath.startsWith(`${profile.organization_id}/`) || filePath.includes("..")) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60 * 5, download ? { download: true } : undefined);

  if (error) return null;
  return data.signedUrl;
}
