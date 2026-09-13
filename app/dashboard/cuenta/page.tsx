import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/components/cuenta/change-password-form";
import { AuxiliarManager } from "@/components/cuenta/auxiliar-manager";
import type { Profile } from "@/lib/supabase/types";

export default async function CuentaPage() {
  const profile = await requireProfile();

  let auxiliares: Profile[] = [];
  let maxAuxiliares = 0;

  if (profile.role === "owner" && profile.organization_id) {
    const supabase = await createClient();
    const [{ data: aux }, { data: org }] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("role", "auxiliar")
        .order("created_at", { ascending: true }),
      supabase
        .from("organizations")
        .select("max_auxiliares")
        .eq("id", profile.organization_id)
        .single(),
    ]);
    auxiliares = (aux as Profile[]) ?? [];
    maxAuxiliares = org?.max_auxiliares ?? 0;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Mi Cuenta</h1>
        <p className="text-sm text-brand-muted">
          {profile.full_name} · @{profile.username}
        </p>
      </div>

      <ChangePasswordForm />

      {profile.role === "owner" && (
        <AuxiliarManager auxiliares={auxiliares} maxAuxiliares={maxAuxiliares} />
      )}
    </div>
  );
}
