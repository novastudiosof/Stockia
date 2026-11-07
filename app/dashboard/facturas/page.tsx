import { requireProfile } from "@/lib/auth";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import { InvoicesTable, type InvoiceRow } from "@/components/facturas/invoices-table";
import type { Invoice, Movement } from "@/lib/supabase/types";

// Tope por origen: la lista es de consulta; para algo más antiguo se filtra
// por fecha. Se trae solo lo necesario, ya ordenado por fecha.
const LIMIT = 500;

export default async function FacturasPage() {
  const profile = await requireProfile();
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.FACTURAS);

  const supabase = await createClient();
  const [{ data: expenses }, { data: legacy }] = await Promise.all([
    // Facturas y soportes que se adjuntan al registrar un gasto.
    supabase
      .from("movements")
      .select("id, concept, description, amount, occurred_at, file_path")
      .eq("organization_id", profile.organization_id)
      .eq("type", "gasto")
      .not("file_path", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(LIMIT),
    // Facturas cargadas antes con el formulario anterior (solo consulta).
    supabase
      .from("invoices")
      .select("id, provider, invoice_number, amount, occurred_at, file_path")
      .eq("organization_id", profile.organization_id)
      .not("file_path", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(LIMIT),
  ]);

  const rows: InvoiceRow[] = [
    ...((expenses as Pick<
      Movement,
      "id" | "concept" | "description" | "amount" | "occurred_at" | "file_path"
    >[]) ?? []).map(
      (m): InvoiceRow => ({
        id: m.id,
        source: "gasto",
        title: m.concept || m.description || "Gasto",
        subtitle: m.concept && m.description ? m.description : "",
        date: m.occurred_at,
        amount: Number(m.amount),
        filePath: m.file_path,
      })
    ),
    ...((legacy as Pick<
      Invoice,
      "id" | "provider" | "invoice_number" | "amount" | "occurred_at" | "file_path"
    >[]) ?? []).map(
      (i): InvoiceRow => ({
        id: i.id,
        source: "factura",
        title: i.provider,
        subtitle: `N.° ${i.invoice_number}`,
        date: i.occurred_at,
        amount: Number(i.amount),
        filePath: i.file_path,
      })
    ),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Facturas</h1>
        <p className="text-sm text-brand-muted">
          Aquí aparecen las facturas y soportes que adjuntas al registrar un gasto en Ventas y
          Gastos. Puedes buscarlas, verlas y descargarlas.
        </p>
      </div>
      <InvoicesTable rows={rows} />
    </div>
  );
}
