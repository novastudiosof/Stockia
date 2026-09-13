"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  updateMaxAuxiliares,
  updateOrganizationLimits,
  toggleOrganizationActive,
} from "@/lib/actions/superadmin";
import type { Organization } from "@/lib/supabase/types";

const CATEGORIA_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) * 5); // 5..100
const PRODUCTO_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) * 50); // 50..1000

export function OrganizationSettings({ organization }: { organization: Organization }) {
  const router = useRouter();
  const [maxAuxiliares, setMaxAuxiliares] = React.useState(organization.max_auxiliares);
  const [maxCategorias, setMaxCategorias] = React.useState(organization.max_categorias);
  const [maxProductos, setMaxProductos] = React.useState(
    organization.max_productos_por_categoria
  );
  const [saving, setSaving] = React.useState(false);
  const [savingCatalogo, setSavingCatalogo] = React.useState(false);
  const [togglingActive, setTogglingActive] = React.useState(false);

  async function handleSaveLimit() {
    setSaving(true);
    await updateMaxAuxiliares(organization.id, maxAuxiliares);
    setSaving(false);
    router.refresh();
  }

  async function handleSaveCatalogoLimits() {
    setSavingCatalogo(true);
    await updateOrganizationLimits(organization.id, maxCategorias, maxProductos);
    setSavingCatalogo(false);
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

        <div className="flex flex-col gap-3 sm:max-w-sm">
          <div>
            <p className="font-medium text-brand-ink">Límites de catálogo</p>
            <p className="text-sm text-brand-muted">
              Solo define el tope; las categorías y productos las crea la propia
              organización desde su Catálogo.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxCategorias">Máximo de categorías</Label>
            <select
              id="maxCategorias"
              className="h-9 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
              value={maxCategorias}
              onChange={(event) => setMaxCategorias(Number(event.target.value))}
            >
              {CATEGORIA_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxProductos">Máximo de productos por categoría</Label>
            <select
              id="maxProductos"
              className="h-9 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
              value={maxProductos}
              onChange={(event) => setMaxProductos(Number(event.target.value))}
            >
              {PRODUCTO_STEPS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            className="self-start"
            onClick={handleSaveCatalogoLimits}
            disabled={
              savingCatalogo ||
              (maxCategorias === organization.max_categorias &&
                maxProductos === organization.max_productos_por_categoria)
            }
          >
            {savingCatalogo ? "Guardando..." : "Guardar límites"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
