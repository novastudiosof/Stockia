"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMaxAuxiliares, toggleOrganizationActive } from "@/lib/actions/superadmin";
import type { Organization } from "@/lib/supabase/types";

export function OrganizationSettings({ organization }: { organization: Organization }) {
  const router = useRouter();
  const [maxAuxiliares, setMaxAuxiliares] = React.useState(organization.max_auxiliares);
  const [saving, setSaving] = React.useState(false);
  const [togglingActive, setTogglingActive] = React.useState(false);

  async function handleSaveLimit() {
    setSaving(true);
    await updateMaxAuxiliares(organization.id, maxAuxiliares);
    setSaving(false);
    router.refresh();
  }

  async function handleToggleActive(checked: boolean) {
    setTogglingActive(true);
    await toggleOrganizationActive(organization.id, checked);
    setTogglingActive(false);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de la organización</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-brand-ink">Acceso activo</p>
            <p className="text-sm text-brand-muted">
              Si lo desactivas, ningún usuario de esta organización podrá iniciar sesión.
            </p>
          </div>
          <Switch
            checked={organization.is_active}
            disabled={togglingActive}
            onCheckedChange={handleToggleActive}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="maxAuxiliares">Auxiliares incluidos en el plan</Label>
          <div className="flex gap-2">
            <Input
              id="maxAuxiliares"
              type="number"
              min={0}
              max={50}
              value={maxAuxiliares}
              onChange={(event) => setMaxAuxiliares(Number(event.target.value))}
            />
            <Button
              variant="outline"
              onClick={handleSaveLimit}
              disabled={saving || maxAuxiliares === organization.max_auxiliares}
            >
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
