import { notFound } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { ThermalInvoice } from "@/components/ventas-productos/thermal-invoice";
import type { Organization, Sale } from "@/lib/supabase/types";

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" });

export default async function FacturaVentaPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const { saleId } = await params;
  const profile = await requireProfile();
  if (!profile.organization_id) notFound();
  await requireModule(profile.organization_id, MODULE_KEYS.VENTAS_PRODUCTOS);

  const supabase = await createClient();
  const [{ data: sale }, { data: organization }] = await Promise.all([
    supabase
      .from("sales")
      .select("*")
      .eq("id", saleId)
      .eq("organization_id", profile.organization_id)
      .single(),
    supabase.from("organizations").select("*").eq("id", profile.organization_id).single(),
  ]);

  if (!sale || !organization) notFound();

  const saleRow = sale as Sale;
  const org = organization as Organization;
  const invoiceNumber = saleRow.sale_number
    ? `${org.invoice_prefix || ""}${saleRow.sale_number}`
    : saleRow.id.slice(0, 8).toUpperCase();

  return (
    <ThermalInvoice
      invoiceNumber={invoiceNumber}
      dateLabel={dateTime.format(new Date(saleRow.created_at))}
      voided={Boolean(saleRow.voided_at)}
      customer={saleRow.customer_snapshot}
      items={saleRow.items}
      total={saleRow.total}
      organization={org}
    />
  );
}
