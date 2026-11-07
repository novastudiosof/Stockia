import "server-only";

import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const BUCKET = "branding";
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
// El navegador ya la comprime a ~50 KB; este tope solo frena subidas directas.
const MAX_BYTES = 400 * 1024;

export function validateCategoryImage(file: File | null): string | null {
  if (!file || file.size === 0) return null;
  if (!ALLOWED_TYPES.includes(file.type)) return "La imagen debe ser WEBP, JPG o PNG";
  if (file.size > MAX_BYTES) return "La imagen es demasiado pesada; prueba con otra foto";
  return null;
}

/**
 * Sube la imagen con nombre único (uuid) y caché de un año: como el nombre
 * cambia en cada subida, los navegadores y la CDN pueden guardarla para
 * siempre y aun así todos los dispositivos ven la nueva (la dirección nueva
 * queda en la base de datos).
 */
export async function uploadCategoryImage(
  supabase: Supabase,
  organizationId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  const extension = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const path = `${organizationId}/categorias/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    console.error("[uploadCategoryImage]", error);
    return { error: "No se pudo subir la imagen" };
  }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl };
}

/** Borra el archivo de una imagen anterior (si falla, solo queda un archivo huérfano). */
export async function removeCategoryImage(supabase: Supabase, url: string | null | undefined) {
  if (!url) return;
  const marker = `/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  await supabase.storage.from(BUCKET).remove([path]);
}
