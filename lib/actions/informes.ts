"use server";

import { requireRole } from "@/lib/auth";
import { dayEnd, dayStart, isDay } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import { requireModule, MODULE_KEYS } from "@/lib/modules";
import { sanitizeOrFilterTerm } from "@/lib/postgrest-filter";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  Product,
  ProfitByPeriod,
  ProfitByProduct,
  ProfitSummary,
  Sale,
} from "@/lib/supabase/types";

/**
 * Vista previa paginada de los informes. Todas las consultas:
 *  - se filtran por organización y rango de fechas (usan índices),
 *  - paginan por cursor ("keyset") en vez de OFFSET, así la página 500 cuesta
 *    lo mismo que la primera aunque haya cientos de miles de filas,
 *  - piden solo las columnas que se muestran (nada de JSONB pesado en listas),
 *  - cuentan el total una sola vez, en la primera página.
 */
const PAGE_SIZE = 25;

export interface PageResult<Row> {
  rows: Row[];
  nextCursor: string | null;
  /** Solo viene en la primera página (cuando no hay cursor). */
  total?: number;
  error?: string;
}

async function requireInformes() {
  const profile = await requireRole("owner");
  if (!profile.organization_id) return null;
  await requireModule(profile.organization_id, MODULE_KEYS.INFORMES);
  return { profile, organizationId: profile.organization_id };
}

/**
 * Mensaje amigable + código del error de Postgres entre corchetes (solo el
 * código, nunca el texto interno) para poder diagnosticar desde el celular o
 * la captura de pantalla sin abrir los logs. El detalle completo queda en el
 * log del servidor.
 */
function reportError(
  error: { code?: string; message?: string } | null,
  context: string,
  fallback: string,
  overrides?: Record<string, string>
): string {
  const message = friendlyDbError(error, context, fallback, overrides);
  return error?.code && error.code !== "P0001" ? `${message} [${error.code}]` : message;
}

/** Valor entre comillas dobles para filtros `.or()` de PostgREST. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function splitCursor(cursor: string | null | undefined): [string, string] | null {
  if (!cursor) return null;
  const index = cursor.lastIndexOf("|");
  if (index <= 0) return null;
  return [cursor.slice(0, index), cursor.slice(index + 1)];
}

// ---------------------------------------------------------------- Ventas

export interface SalesPreviewFilters {
  from?: string;
  to?: string;
  /** Nombre o documento del cliente, o número de factura. */
  query?: string;
}

export type SalesPreviewRow = Pick<
  Sale,
  | "id"
  | "sale_number"
  | "created_at"
  | "customer_snapshot"
  | "total"
  | "payment_method"
  | "pay_cash"
  | "pay_nequi"
  | "pay_daviplata"
  | "pay_llave"
  | "sold_by_name"
  | "voided_at"
  | "void_kind"
>;

const SALES_COLUMNS =
  "id, sale_number, created_at, customer_snapshot, total, payment_method, pay_cash, pay_nequi, pay_daviplata, pay_llave, sold_by_name, voided_at, void_kind";

export async function previewSales(
  filters: SalesPreviewFilters,
  cursor?: string | null
): Promise<PageResult<SalesPreviewRow>> {
  const ctx = await requireInformes();
  if (!ctx) return { rows: [], nextCursor: null };

  const supabase = await createClient();
  let query = supabase
    .from("sales")
    .select(SALES_COLUMNS, cursor ? undefined : { count: "exact" })
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (isDay(filters.from)) query = query.gte("created_at", dayStart(filters.from));
  if (isDay(filters.to)) query = query.lte("created_at", dayEnd(filters.to));

  const term = sanitizeOrFilterTerm((filters.query ?? "").trim()).slice(0, 80);
  if (term) {
    const clauses = [
      `customer_snapshot->>nombre.ilike.*${term}*`,
      `customer_snapshot->>documento.ilike.*${term}*`,
    ];
    const asNumber = Number(term);
    if (Number.isInteger(asNumber) && asNumber > 0 && asNumber < 2_000_000_000) {
      clauses.push(`sale_number.eq.${asNumber}`);
    }
    query = query.or(clauses.join(","));
  }

  const parts = splitCursor(cursor);
  if (parts) {
    const [createdAt, id] = parts;
    query = query.or(
      `created_at.lt.${quote(createdAt)},and(created_at.eq.${quote(createdAt)},id.lt.${id})`
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return {
      rows: [],
      nextCursor: null,
      error: reportError(error, "previewSales", "No se pudieron cargar las ventas"),
    };
  }

  const all = (data as unknown as SalesPreviewRow[]) ?? [];
  const rows = all.slice(0, PAGE_SIZE);
  const last = rows[rows.length - 1];
  return {
    rows,
    nextCursor: all.length > PAGE_SIZE && last ? `${last.created_at}|${last.id}` : null,
    total: cursor ? undefined : (count ?? rows.length),
  };
}

// ------------------------------------------------------ Ventas y gastos

export interface MovementsPreviewFilters {
  from?: string;
  to?: string;
}

/** Fila del listado de Ventas y Gastos: movimiento manual o ventas del día. */
export interface MovementPreviewRow {
  /** Id del movimiento, o "sales-AAAA-MM-DD" para las ventas por productos. */
  id: string;
  kind: "venta" | "gasto" | "venta_productos";
  concept: string | null;
  description: string | null;
  amount: number;
  occurred_at: string;
}

const MIGRATION_017 = "Falta ejecutar la migración 017 en Supabase";

/**
 * Igual que la pantalla "Ventas y Gastos": movimientos manuales más las
 * ventas del carrito (una fila por día). La unión y el cursor (día, clave)
 * se resuelven en la función ventas_gastos_feed de la base de datos.
 */
export async function previewMovements(
  filters: MovementsPreviewFilters,
  cursor?: string | null
): Promise<PageResult<MovementPreviewRow>> {
  const ctx = await requireInformes();
  if (!ctx) return { rows: [], nextCursor: null };

  const supabase = await createClient();
  const from = isDay(filters.from) ? filters.from : null;
  const to = isDay(filters.to) ? filters.to : null;
  const parts = splitCursor(cursor);

  const [feed, count] = await Promise.all([
    supabase.rpc("ventas_gastos_feed", {
      p_from: from,
      p_to: to,
      p_after_day: parts?.[0] ?? null,
      p_after_key: parts?.[1] ?? null,
      p_limit: PAGE_SIZE + 1,
    }),
    cursor
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("ventas_gastos_feed_count", { p_from: from, p_to: to }),
  ]);

  const failure = feed.error ?? count.error;
  if (failure) {
    return {
      rows: [],
      nextCursor: null,
      error: reportError(failure, "previewMovements", "No se pudieron cargar los movimientos", {
        PGRST202: MIGRATION_017,
        "42883": MIGRATION_017,
      }),
    };
  }

  const all = feed.data ?? [];
  const page = all.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: r.key,
      kind: r.kind,
      concept: r.concept,
      description:
        r.kind === "venta_productos"
          ? `${r.sales_count ?? 0} venta${r.sales_count === 1 ? "" : "s"} del día`
          : r.description,
      amount: Number(r.amount),
      occurred_at: r.day,
    })),
    nextCursor: all.length > PAGE_SIZE && last ? `${last.day}|${last.key}` : null,
    total: cursor ? undefined : Number(count.data ?? page.length),
  };
}

// ------------------------------------------------------------ Inventario

export type InventoryPreviewRow = Pick<
  Product,
  "id" | "name" | "barcode" | "quantity" | "purchase_price" | "sale_price"
> & { category: string };

export async function previewInventory(
  filters: { query?: string },
  cursor?: string | null
): Promise<PageResult<InventoryPreviewRow>> {
  const ctx = await requireInformes();
  if (!ctx) return { rows: [], nextCursor: null };

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      "id, name, barcode, quantity, purchase_price, sale_price, category_id",
      cursor ? undefined : { count: "exact" }
    )
    .eq("organization_id", ctx.organizationId)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE + 1);

  const term = sanitizeOrFilterTerm((filters.query ?? "").trim()).slice(0, 80);
  if (term) query = query.or(`name.ilike.*${term}*,barcode.ilike.*${term}*`);

  const parts = splitCursor(cursor);
  if (parts) {
    const [name, id] = parts;
    query = query.or(`name.gt.${quote(name)},and(name.eq.${quote(name)},id.gt.${id})`);
  }

  const [{ data, error, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name").eq("organization_id", ctx.organizationId),
  ]);
  if (error) {
    return {
      rows: [],
      nextCursor: null,
      error: reportError(error, "previewInventory", "No se pudo cargar el inventario"),
    };
  }

  const categoryName = new Map(
    ((categories as Pick<Category, "id" | "name">[]) ?? []).map((c) => [c.id, c.name])
  );
  const all = (data as unknown as (Omit<InventoryPreviewRow, "category"> & { category_id: string })[]) ?? [];
  const page = all.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    rows: page.map(({ category_id, ...rest }) => ({
      ...rest,
      category: categoryName.get(category_id) ?? "—",
    })),
    nextCursor: all.length > PAGE_SIZE && last ? `${last.name}|${last.id}` : null,
    total: cursor ? undefined : (count ?? page.length),
  };
}

// --------------------------------------------------------------- Utilidad

export interface ProfitReport {
  summary: ProfitSummary;
  byProduct: ProfitByProduct[];
  byPeriod: ProfitByPeriod[];
  group: "day" | "month";
  error?: string;
}

const MAX_PROFIT_RANGE_DAYS = 366 * 3;

/**
 * Utilidad del rango. Todo se calcula en la base de datos (funciones
 * profit_*), así el costo es el mismo con 100 o con 1.000.000 de ventas y no
 * se traen filas a la aplicación.
 */
export async function getProfitReport(
  from: string,
  to: string
): Promise<ProfitReport | { error: string }> {
  const ctx = await requireInformes();
  if (!ctx) return { error: "Sin organización asociada" };
  if (!isDay(from) || !isDay(to)) return { error: "Fechas inválidas" };

  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (!(days >= 1)) return { error: "La fecha final no puede ser anterior a la inicial" };
  if (days > MAX_PROFIT_RANGE_DAYS) return { error: "El rango máximo es de 3 años" };

  const group = days > 62 ? "month" : "day";
  const supabase = await createClient();

  const [summary, byProduct, byPeriod] = await Promise.all([
    supabase.rpc("profit_summary", { p_from: from, p_to: to }).single<ProfitSummary>(),
    supabase.rpc("profit_by_product", { p_from: from, p_to: to, p_limit: 15 }),
    supabase.rpc("profit_by_period", { p_from: from, p_to: to, p_group: group }),
  ]);

  const failure = summary.error ?? byProduct.error ?? byPeriod.error;
  if (failure || !summary.data) {
    return { error: reportError(failure, "getProfitReport", "No se pudo calcular la utilidad", {
        PGRST202: "Falta ejecutar la migración 016 en Supabase",
        "42883": "Falta ejecutar la migración 016 en Supabase",
      }) };
  }

  const num = (v: unknown) => Number(v) || 0;
  return {
    group,
    summary: {
      sales_count: num(summary.data.sales_count),
      revenue: num(summary.data.revenue),
      cost: num(summary.data.cost),
      gross_profit: num(summary.data.gross_profit),
      manual_sales: num(summary.data.manual_sales),
      expenses: num(summary.data.expenses),
    },
    byProduct: (byProduct.data ?? []).map((r) => ({
      ...r,
      units: num(r.units),
      revenue: num(r.revenue),
      cost: num(r.cost),
      profit: num(r.profit),
    })),
    byPeriod: (byPeriod.data ?? []).map((r) => ({
      ...r,
      revenue: num(r.revenue),
      cost: num(r.cost),
      profit: num(r.profit),
    })),
  };
}
