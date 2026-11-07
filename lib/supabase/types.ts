export type UserRole = "super_admin" | "owner" | "auxiliar";
export type MovementType = "venta" | "gasto";

// NOTA: estos modelos usan `type X = {...}` y no `interface X {...}` a
// propósito. El cliente de Supabase exige que cada Row/Insert/Update sea
// estructuralmente compatible con `Record<string, unknown>`, y TypeScript
// solo reconoce esa compatibilidad para alias de tipo con forma de objeto,
// no para interfaces (aunque tengan exactamente las mismas propiedades) — es
// una particularidad del checker, no una preferencia de estilo. Si conviertes
// alguno de vuelta a `interface`, el tipado de Supabase se rompe en silencio
// (las tablas quedan como `never` en vez de dar un error claro aquí).

export type Organization = {
  id: string;
  name: string;
  slug: string;
  max_auxiliares: number;
  max_categorias: number;
  max_productos_por_categoria: number;
  is_active: boolean;
  legal_name: string | null;
  tax_id: string | null;
  billing_address: string | null;
  billing_phone: string | null;
  billing_email: string | null;
  invoice_footer: string | null;
  currency: string;
  invoice_prefix: string;
  next_sale_number: number;
  logo_url: string | null;
  business_type: string;
  theme_color: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  organization_id: string | null;
  username: string;
  full_name: string;
  role: UserRole;
  auth_email: string;
  created_at: string;
};

export type ModuleDef = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  created_at: string;
};

export type OrganizationModule = {
  organization_id: string;
  module_id: string;
  enabled: boolean;
  enabled_at: string | null;
};

export type Category = {
  id: string;
  organization_id: string;
  name: string;
  icon: string;
  color: string;
  image_url: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  organization_id: string;
  category_id: string;
  name: string;
  quantity: number;
  description: string | null;
  purchase_price: number;
  sale_price: number;
  barcode: string | null;
  created_at: string;
  updated_at: string;
};

export type StockMovement = {
  id: string;
  organization_id: string;
  product_id: string | null;
  delta: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  source: "initial" | "manual" | "sale" | "void" | "import";
  created_by: string | null;
  created_at: string;
};

export type Cliente = {
  id: string;
  organization_id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSnapshot = {
  nombre: string;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
};

export type Movement = {
  id: string;
  organization_id: string;
  type: MovementType;
  amount: number;
  description: string | null;
  occurred_at: string;
  file_path: string | null;
  concept: string | null;
  created_by: string | null;
  created_at: string;
};

export type MovementConcept = {
  id: string;
  organization_id: string;
  type: MovementType;
  name: string;
  created_at: string;
};

export type PaymentMethod = "efectivo" | "transferencia" | "mixto";
export type TransferChannel = "nequi" | "daviplata" | "llave";

export type CashDay = {
  organization_id: string;
  day: string;
  base_amount: number;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  sales_cash: number;
  sales_nequi: number;
  sales_daviplata: number;
  sales_llave: number;
  manual_sales: number;
  expenses: number;
  expected_cash: number;
  counted_cash: number | null;
  difference: number | null;
  notes: string | null;
  created_at: string;
};

export type SaleItem = {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  /** Precio de compra al vender (lo agrega un trigger; ventas viejas: estimado). */
  unitCost?: number;
};

export type ProfitSummary = {
  sales_count: number;
  revenue: number;
  cost: number;
  gross_profit: number;
  manual_sales: number;
  expenses: number;
};

export type ProfitByProduct = {
  product_id: string;
  name: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
};

export type ProfitByPeriod = {
  period: string;
  revenue: number;
  cost: number;
  profit: number;
};

export type Sale = {
  id: string;
  organization_id: string;
  items: SaleItem[];
  total: number;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  customer_id: string | null;
  customer_snapshot: CustomerSnapshot | null;
  sale_number: number | null;
  payment_method: PaymentMethod;
  pay_cash: number;
  pay_nequi: number;
  pay_daviplata: number;
  pay_llave: number;
  sold_by_name: string | null;
  customer_email: string | null;
  email_sent_at: string | null;
  /** Identificador aleatorio para compartir la factura por enlace. */
  public_token?: string;
};

export type Invoice = {
  id: string;
  organization_id: string;
  provider: string;
  invoice_number: string;
  amount: number;
  occurred_at: string;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type ActivityLogEntry = {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  username: string;
  role: UserRole;
  action: string;
  details: string | null;
  created_at: string;
};

// Tipado escrito a mano (no hay Supabase CLI conectado a un proyecto en este
// entorno para generarlo con `supabase gen types typescript`) que refleja
// exactamente las tablas y funciones de sql/001..011. Reemplaza el antiguo
// `Database = any`: ahora un typo en un nombre de tabla/columna, o pasarle a
// una función RPC un argumento con el nombre o tipo equivocado, lo marca
// TypeScript en vez de solo verse en producción. Si más adelante conectan el
// CLI, `supabase gen types typescript` puede reemplazar este archivo sin que
// el resto del código cambie (los tipos Row de arriba seguirían siendo las
// mismas formas).
type NewSaleItemInput = {
  productId: string;
  quantity: number;
};

type NewCustomerData = {
  nombre: string;
  documento?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
};

export type CashDaySummary = {
  sales_count: number;
  sales_total: number;
  sales_cash: number;
  sales_nequi: number;
  sales_daviplata: number;
  sales_llave: number;
  manual_sales: number;
  expenses: number;
};

export type DailySales = { day: string; sales_count: number; total: number };

export type PaymentInput =
  | { method: "efectivo" }
  | { method: "transferencia"; channel: TransferChannel }
  | {
      method: "mixto";
      efectivo: number;
      nequi: number;
      daviplata: number;
      llave: number;
    };

type BulkImportItem = {
  categoryId: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  description: string;
  barcode: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Partial<Organization> & Pick<Organization, "name" | "slug">;
        Update: Partial<Organization>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> &
          Pick<Profile, "id" | "username" | "full_name" | "auth_email" | "role">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      modules: {
        Row: ModuleDef;
        Insert: Partial<ModuleDef> & Pick<ModuleDef, "key" | "name">;
        Update: Partial<ModuleDef>;
        Relationships: [];
      };
      organization_modules: {
        Row: OrganizationModule;
        Insert: Partial<OrganizationModule> &
          Pick<OrganizationModule, "organization_id" | "module_id">;
        Update: Partial<OrganizationModule>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & Pick<Category, "organization_id" | "name">;
        Update: Partial<Category>;
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: Partial<Product> & Pick<Product, "organization_id" | "category_id" | "name">;
        Update: Partial<Product>;
        Relationships: [];
      };
      movements: {
        Row: Movement;
        Insert: Partial<Movement> & Pick<Movement, "organization_id" | "type" | "amount">;
        Update: Partial<Movement>;
        Relationships: [];
      };
      invoices: {
        Row: Invoice;
        Insert: Partial<Invoice> & Pick<Invoice, "organization_id" | "provider" | "invoice_number">;
        Update: Partial<Invoice>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Partial<ActivityLogEntry> & Pick<ActivityLogEntry, "username" | "role" | "action">;
        Update: Partial<ActivityLogEntry>;
        Relationships: [];
      };
      sales: {
        Row: Sale;
        Insert: Partial<Sale> & Pick<Sale, "organization_id" | "items" | "total">;
        Update: Partial<Sale>;
        Relationships: [];
      };
      clientes: {
        Row: Cliente;
        Insert: Partial<Cliente> & Pick<Cliente, "organization_id" | "nombre">;
        Update: Partial<Cliente>;
        Relationships: [];
      };
      movement_concepts: {
        Row: MovementConcept;
        Insert: Partial<MovementConcept> &
          Pick<MovementConcept, "organization_id" | "type" | "name">;
        Update: Partial<MovementConcept>;
        Relationships: [];
      };
      cash_days: {
        Row: CashDay;
        Insert: Partial<CashDay> & Pick<CashDay, "organization_id" | "day">;
        Update: Partial<CashDay>;
        Relationships: [];
      };
      stock_movements: {
        Row: StockMovement;
        Insert: Partial<StockMovement> &
          Pick<StockMovement, "organization_id" | "delta" | "previous_quantity" | "new_quantity" | "source">;
        Update: Partial<StockMovement>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_product: {
        Args: {
          p_organization_id: string;
          p_category_id: string;
          p_name: string;
          p_quantity: number;
          p_description: string;
          p_purchase_price: number;
          p_sale_price: number;
          p_barcode: string;
        };
        Returns: Product;
      };
      create_sale: {
        Args: {
          p_organization_id: string;
          p_items: NewSaleItemInput[];
          p_customer_id?: string | null;
          p_customer_data?: NewCustomerData | null;
          p_payment?: PaymentInput | null;
          p_customer_email?: string | null;
        };
        Returns: { sale_id: string; total: number; sale_number: number }[];
      };
      set_cash_base: {
        Args: { p_day: string; p_base: number };
        Returns: undefined;
      };
      close_cash_day: {
        Args: { p_day: string; p_counted: number; p_notes?: string | null };
        Returns: CashDay;
      };
      cash_day_summary: {
        Args: { p_day: string };
        Returns: CashDaySummary[];
      };
      daily_sales: {
        Args: Record<string, never>;
        Returns: DailySales[];
      };
      reopen_cash_day: {
        Args: { p_day: string };
        Returns: undefined;
      };
      void_sale: {
        Args: { p_sale_id: string };
        Returns: undefined;
      };
      adjust_stock: {
        Args: {
          p_organization_id: string;
          p_product_id: string;
          p_delta: number;
          p_reason: string;
        };
        Returns: number;
      };
      ventas_gastos_feed: {
        Args: {
          p_from: string | null;
          p_to: string | null;
          p_after_day?: string | null;
          p_after_key?: string | null;
          p_limit?: number;
        };
        Returns: {
          day: string;
          key: string;
          kind: "venta" | "gasto" | "venta_productos";
          concept: string | null;
          description: string | null;
          amount: number;
          sales_count: number | null;
        }[];
      };
      ventas_gastos_feed_count: {
        Args: { p_from: string | null; p_to: string | null };
        Returns: number;
      };
      profit_summary: {
        Args: { p_from: string; p_to: string };
        Returns: ProfitSummary[];
      };
      profit_by_product: {
        Args: { p_from: string; p_to: string; p_limit?: number };
        Returns: ProfitByProduct[];
      };
      profit_by_period: {
        Args: { p_from: string; p_to: string; p_group?: "day" | "month" };
        Returns: ProfitByPeriod[];
      };
      bulk_import_products: {
        Args: {
          p_organization_id: string;
          p_items: BulkImportItem[];
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
