"use client";

import * as React from "react";
import { useActionState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateInvoiceSettings } from "@/lib/actions/superadmin";
import type { Organization } from "@/lib/supabase/types";

export function InvoiceSettings({ organization }: { organization: Organization }) {
  const boundAction = updateInvoiceSettings.bind(null, organization.id);
  const [state, formAction, pending] = useActionState(boundAction, undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de facturación</CardTitle>
        <p className="text-sm text-brand-muted">
          Aparecen en las facturas de venta que esta organización imprime desde &quot;Ventas por
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
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="logo">Logo</Label>
              {organization.logo_url && (
                <Image
                  src={organization.logo_url}
                  alt="Logo actual"
                  width={120}
                  height={48}
                  unoptimized
                  className="h-12 w-auto object-contain"
                />
              )}
              <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" />
            </div>
          </div>

          {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}

          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Guardando..." : "Guardar datos de facturación"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
