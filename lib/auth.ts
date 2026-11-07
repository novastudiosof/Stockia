import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Organization, Profile, UserRole } from "@/lib/supabase/types";

/**
 * Id del usuario con sesión. getClaims() verifica la firma del token en el
 * propio servidor (el proyecto usa claves asimétricas), sin viajar a Supabase
 * como hacía getUser(): ahorra un viaje de red por cada llamada.
 * Que el usuario siga existiendo y su negocio esté activo lo comprueba el
 * proxy en cada petición con la consulta del perfil.
 */
const getSessionUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims?.sub ?? null;
});

// cache(): layout y página piden el perfil en la misma petición y solo se
// consulta una vez.
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  return (profile as Profile) ?? null;
});

/** Organización del usuario actual (una consulta por petición). */
export const getCurrentOrganization = cache(
  async (organizationId: string): Promise<Organization | null> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", organizationId)
      .single();
    return (data as Organization) ?? null;
  }
);

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}
