"use client";

import * as React from "react";
import { useActionState } from "react";
import { ImagePlus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateMyInvoiceSettings } from "@/lib/actions/cuenta";
import type { Organization } from "@/lib/supabase/types";

export function InvoiceSettings({ organization }: { organization: Organization }) {
  const [state, formAction, pending] = useActionState(updateMyInvoiceSettings, undefined);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? null);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de facturación</CardTitle>
        <p className="text-sm text-brand-muted">
          Aparecen en las facturas de venta que imprime tu negocio desde &quot;Ventas por
          Productos&quot;.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="legalName">Razón social</Label>
              <Input
                id="legalName"
                name="legalName"
                defaultValue={organization.legal_name ?? ""}
                placeholder={organization.name}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxId">NIT / documento fiscal</Label>
              <Input id="taxId" name="taxId" defaultValue={organization.tax_id ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingPhone">Teléfono</Label>
              <Input
                id="billingPhone"
                name="billingPhone"
                defaultValue={organization.billing_phone ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingEmail">Correo</Label>
              <Input
                id="billingEmail"
                name="billingEmail"
                defaultValue={organization.billing_email ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="billingAddress">Dirección</Label>
              <Input
                id="billingAddress"
                name="billingAddress"
                defaultValue={organization.billing_address ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currency">Moneda (ISO, ej: COP)</Label>
              <Input
                id="currency"
                name="currency"
                maxLength={3}
                defaultValue={organization.currency}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoicePrefix">Prefijo de numeración</Label>
              <Input
                id="invoicePrefix"
                name="invoicePrefix"
                defaultValue={organization.invoice_prefix}
                placeholder="FAC-"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="invoiceFooter">Pie de página de la factura</Label>
              <Input
                id="invoiceFooter"
                name="invoiceFooter"
                defaultValue={organization.invoice_footer ?? ""}
                placeholder="Ej: Gracias por su compra. No se aceptan devoluciones sin factura."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxDv">Dígito de verificación (DV) del NIT</Label>
              <Input id="taxDv" name="taxDv" maxLength={2} defaultValue={organization.tax_dv ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="billingCity">Ciudad</Label>
              <Input
                id="billingCity"
                name="billingCity"
                defaultValue={organization.billing_city ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxRegime">Régimen</Label>
              <Input
                id="taxRegime"
                name="taxRegime"
                defaultValue={organization.tax_regime ?? ""}
                placeholder="Ej: Responsable de IVA, No responsable de IVA"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxResponsibilities">Responsabilidades fiscales</Label>
              <Input
                id="taxResponsibilities"
                name="taxResponsibilities"
                defaultValue={organization.tax_responsibilities ?? ""}
                placeholder="Ej: O-13, O-15"
              />
            </div>

            <div className="flex flex-col gap-3 rounded-[var(--radius-brand-sm)] border border-brand-border p-3 sm:col-span-2">
              <label className="flex items-start gap-2 text-sm text-brand-ink">
                <input
                  type="checkbox"
                  name="taxEnabled"
                  defaultChecked={organization.tax_enabled}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Manejar impuestos (IVA / impuesto al consumo)</span>
                  <span className="block text-xs text-brand-muted">
                    Apagado: las ventas se registran como hasta ahora. Encendido: cada producto
                    tiene su impuesto y la venta guarda el desglose.
                  </span>
                </span>
              </label>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pricesIncludeTax">Mis precios de venta</Label>
                <select
                  id="pricesIncludeTax"
                  name="pricesIncludeTax"
                  defaultValue={organization.prices_include_tax ? "included" : "excluded"}
                  className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 text-sm"
                >
                  <option value="included">Ya incluyen el impuesto (el cliente paga el precio)</option>
                  <option value="excluded">No incluyen el impuesto (se suma al precio)</option>
                </select>
                <p className="text-xs text-brand-muted">
                  Si cambias esto, el precio final de los productos con impuesto cambia. Revisa los
                  precios antes de vender.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolutionNumber">Resolución de numeración (DIAN)</Label>
              <Input
                id="resolutionNumber"
                name="resolutionNumber"
                defaultValue={organization.invoice_resolution_number ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolutionValidUntil">Vigente hasta</Label>
              <Input
                id="resolutionValidUntil"
                name="resolutionValidUntil"
                type="date"
                defaultValue={organization.invoice_resolution_valid_until ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolutionFrom">Rango autorizado: desde</Label>
              <Input
                id="resolutionFrom"
                name="resolutionFrom"
                type="number"
                min={0}
                defaultValue={organization.invoice_resolution_from ?? ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="resolutionTo">Rango autorizado: hasta</Label>
              <Input
                id="resolutionTo"
                name="resolutionTo"
                type="number"
                min={0}
                defaultValue={organization.invoice_resolution_to ?? ""}
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="logo">Logo</Label>
              <div className="flex flex-wrap items-center gap-4">
                {preview || organization.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview ?? organization.logo_url ?? ""}
                    alt="Logo"
                    className="h-16 w-16 rounded-full border border-brand-border bg-white object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-brand-border text-brand-muted">
                    <ImagePlus className="h-6 w-6" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {organization.logo_url || preview ? "Cambiar logo" : "Subir logo"}
                  </Button>
                  <p className="text-xs text-brand-muted">
                    {fileName
                      ? `Seleccionado: ${fileName} — pulsa "Guardar datos de facturación" para aplicarlo.`
                      : "PNG, JPG o WEBP, hasta 3 MB."}
                  </p>
                </div>
                <input
                  ref={fileRef}
                  id="logo"
                  name="logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>

          {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-700">{state.success}</p>}

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Guardando..." : "Guardar datos de facturación"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
