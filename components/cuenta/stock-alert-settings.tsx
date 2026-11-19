"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateStockAlertSettings } from "@/lib/actions/stock";
import type { StockSettings } from "@/lib/stock";

export function StockAlertSettingsForm({ settings }: { settings: StockSettings }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(settings.alertsEnabled);
  const [defaultMin, setDefaultMin] = React.useState(String(settings.defaultMinStock));
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateStockAlertSettings({ enabled, defaultMinStock: defaultMin });
    setSaving(false);
    if (result.error) setMessage({ type: "error", text: result.error });
    else {
      setMessage({ type: "ok", text: result.success ?? "Guardado" });
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertas de inventario</CardTitle>
        <CardDescription>
          Avisa cuando un producto llega a su stock mínimo o se agota: contador en el menú, aviso en
          el Catálogo y pedido sugerido por proveedor. Lo ven el administrador y los auxiliares.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          <span>
            <span className="font-medium text-brand-ink">Activar alertas de stock</span>
            <span className="block text-xs text-brand-muted">
              Si las apagas, no se marca ningún producto como por agotarse.
            </span>
          </span>
        </label>

        {enabled && (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="defaultMinStock">Stock mínimo general</Label>
            <Input
              id="defaultMinStock"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              value={defaultMin}
              onChange={(event) => setDefaultMin(event.target.value)}
            />
            <p className="text-xs text-brand-muted">
              Se usa en los productos que no tienen su propio mínimo. Cada producto puede tener el suyo
              (en el Catálogo, al editarlo). Con 0 solo avisa cuando se agota.
            </p>
          </div>
        )}

        {message && (
          <p className={`text-sm ${message.type === "ok" ? "text-brand-success" : "text-brand-danger"}`}>
            {message.text}
          </p>
        )}
        <Button className="self-start" disabled={saving} onClick={handleSave}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </CardContent>
    </Card>
  );
}
