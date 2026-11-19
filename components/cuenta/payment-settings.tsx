"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMyPaymentSettings } from "@/lib/actions/cuenta";
import type { PaymentSettings } from "@/lib/payments";
import type { OptionalPaymentKey } from "@/lib/supabase/types";

const OPTIONS: { key: OptionalPaymentKey; label: string; hint?: string }[] = [
  { key: "nequi", label: "Nequi" },
  { key: "daviplata", label: "Daviplata" },
  { key: "llave", label: "Llave (Bre-B)" },
  { key: "tarjeta", label: "Tarjeta / datáfono" },
  { key: "otro", label: "Otro medio", hint: "Ponle el nombre que uses: Bold, Bono, Sistecrédito..." },
  { key: "credito", label: "Fiado (venta a crédito)", hint: "Necesita el módulo Clientes." },
];

export function PaymentSettingsForm({
  settings,
  clientesEnabled,
}: {
  settings: PaymentSettings;
  clientesEnabled: boolean;
}) {
  const router = useRouter();
  const [methods, setMethods] = React.useState<OptionalPaymentKey[]>(settings.methods);
  const [otherLabel, setOtherLabel] = React.useState(settings.otherLabel);
  const [creditDays, setCreditDays] = React.useState(String(settings.defaultCreditDays));
  const [maxDiscount, setMaxDiscount] = React.useState(String(settings.maxDiscountPct));
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ type: "ok" | "error"; text: string } | null>(null);

  function toggle(key: OptionalPaymentKey, on: boolean) {
    setMethods((prev) => (on ? [...prev.filter((m) => m !== key), key] : prev.filter((m) => m !== key)));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await updateMyPaymentSettings({
      methods,
      otherLabel,
      defaultCreditDays: creditDays,
      maxDiscountPct: maxDiscount,
    });
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
        <CardTitle>Medios de pago y descuentos</CardTitle>
        <CardDescription>
          Elige con qué te pueden pagar. El efectivo siempre está activo. Solo los medios marcados
          aparecen al vender y al recibir abonos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => (
            <label
              key={option.key}
              className="flex items-start gap-2 rounded-[var(--radius-brand-sm)] border border-brand-border p-3 text-sm"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={methods.includes(option.key)}
                onChange={(event) => toggle(option.key, event.target.checked)}
              />
              <span>
                <span className="font-medium text-brand-ink">{option.label}</span>
                {option.hint && <span className="block text-xs text-brand-muted">{option.hint}</span>}
                {option.key === "credito" && methods.includes("credito") && !clientesEnabled && (
                  <span className="block text-xs text-brand-danger">
                    El módulo Clientes no está activo: el fiado no aparecerá al vender.
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="maxDiscount">Descuento máximo para auxiliares (%)</Label>
            <Input
              id="maxDiscount"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={maxDiscount}
              onChange={(event) => setMaxDiscount(event.target.value)}
            />
            <p className="text-xs text-brand-muted">
              Sobre el valor de la venta. 0 = los auxiliares no pueden dar descuentos. El
              administrador no tiene límite.
            </p>
          </div>
          {methods.includes("otro") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otherLabel">Nombre del medio &quot;Otro&quot;</Label>
              <Input
                id="otherLabel"
                maxLength={30}
                value={otherLabel}
                onChange={(event) => setOtherLabel(event.target.value)}
              />
            </div>
          )}
          {methods.includes("credito") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="creditDays">Plazo del fiado por defecto (días)</Label>
              <Input
                id="creditDays"
                type="number"
                min={0}
                max={365}
                step="1"
                value={creditDays}
                onChange={(event) => setCreditDays(event.target.value)}
              />
              <p className="text-xs text-brand-muted">
                Cada cliente puede tener su propio plazo y cupo en Clientes.
              </p>
            </div>
          )}
        </div>

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
