import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ThermalInvoice } from "@/components/ventas-productos/thermal-invoice";
import { paymentDetail, paymentLabel } from "@/lib/payments";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Organization, Sale } from "@/lib/supabase/types";

// La factura compartida no debe indexarse ni guardarse en cachés compartidas.
export const metadata: Metadata = {
  title: "Factura",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });
const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * Factura pública para el cliente (enlace que se envía por WhatsApp). Se
 * entra con un token aleatorio que no se puede adivinar; no hay lista ni
 * búsqueda, y solo se lee la venta de ese token.
 */
export default async function FacturaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const admin = createAdminClient();
  const { data: sale } = await admin
    .from("sales")
    .select("*")
    .eq("public_token", token)
    .maybeSingle();
  if (!sale) notFound();

  const { data: organization } = await admin
    .from("organizations")
    .select("*")
    .eq("id", sale.organization_id)
    .single();
  if (!organization) notFound();

  const saleRow = sale as Sale;
  const org = organization as Organization;
  const invoiceNumber = saleRow.sale_number
    ? `${org.invoice_prefix || ""}${saleRow.sale_number}`
    : saleRow.id.slice(0, 8).toUpperCase();

  // No se pasa saleId: el botón de PDF necesita sesión; el cliente usa
  // "Imprimir" y elige guardar como PDF.
  return (
    <ThermalInvoice
      invoiceNumber={invoiceNumber}
      dateLabel={dateTime.format(new Date(saleRow.created_at))}
      voided={Boolean(saleRow.voided_at)}
      customer={saleRow.customer_snapshot}
      items={saleRow.items}
      total={saleRow.total}
      organization={org}
      soldBy={saleRow.sold_by_name}
      paymentText={
        saleRow.payment_method === "mixto"
          ? `Mixto (${paymentDetail(saleRow, (n) => currency.format(n))})`
          : paymentLabel(saleRow)
      }
    />
  );
}
