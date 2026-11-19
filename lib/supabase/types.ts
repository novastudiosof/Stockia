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
  /** Maneja IVA / impuesto al consumo (apagado por defecto). */
  tax_enabled: boolean;
  /** true: el precio ya incluye el impuesto; false: se suma encima. */
  prices_include_tax: boolean;
  tax_dv: string | null;
  tax_regime: string | null;
  billing_city: string | null;
  tax_responsibilities: string | null;
  invoice_resolution_number: string | null;
  invoice_resolution_from: number | null;
  invoice_resolution_to: number | null;
  invoice_resolution_valid_until: string | null;
  /** Medios de pago activos además del efectivo (migración 024). */
  payment_methods: OptionalPaymentKey[];
  /** Nombre del medio "Otro" (ej: Bold, Bono). */
  payment_other_label: string;
  /** Plazo del fiado por defecto, en días. */
  default_credit_days: number;
  /** Descuento máximo que puede dar un auxiliar (% de la venta). */
  max_discount_pct: number;
  /** Migración 027: alertas de stock mínimo. */
  stock_alerts_enabled: boolean;
  default_min_stock: number;
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
  tax_kind: "iva" | "consumo" | "exento" | "excluido";
  tax_rate: number;
  /** null = usa el mínimo general del negocio (migración 027). */
  min_stock: number | null;
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
  source: "initial" | "manual" | "sale" | "void" | "import" | "purchase" | "purchase_void";
  created_by: string | null;
  created_at: string;
};

export type Cliente = {
  id: string;
  organization_id: string;
  nombre: string;
  tipo_documento: string | null;
  documento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  /** Cupo de fiado (null = sin cupo: solo el administrador le fía). */
  credit_limit: number | null;
  /** Plazo propio del fiado en días (null = el del negocio). */
  credit_days: number | null;
  created_at: string;
  updated_at: string;
};

export type CustomerSnapshot = {
  nombre: string;
  tipo_documento?: string | null;
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

export type PaymentMethod = "efectivo" | "transferencia" | "tarjeta" | "otro" | "credito" | "mixto";
/** Medios que cada negocio activa o desactiva (el efectivo siempre está). */
export type OptionalPaymentKey = "nequi" | "daviplata" | "llave" | "tarjeta" | "otro" | "credito";
/** Medios con los que se recibe un abono. */
export type AbonoMethod = "efectivo" | "nequi" | "daviplata" | "llave" | "tarjeta" | "otro";
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
  returns_cash: number;
  returns_nequi: number;
  returns_daviplata: number;
  returns_llave: number;
  sales_tarjeta: number;
  sales_otro: number;
  sales_credito: number;
  returns_tarjeta: number;
  returns_otro: number;
  returns_credito: number;
  abonos_cash: number;
  abonos_nequi: number;
  abonos_daviplata: number;
  abonos_llave: number;
  abonos_tarjeta: number;
  abonos_otro: number;
  purchases_cash: number;
  supplier_payments_cash: number;
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
  /** Impuesto (solo si el negocio lo tenía activo al vender). */
  taxKind?: "iva" | "consumo" | "exento" | "excluido" | null;
  taxRate?: number;
  base?: number;
  tax?: number;
  /** Precio de compra al vender (lo agrega un trigger; ventas viejas: estimado). */
  unitCost?: number;
  /** Solo si la línea tuvo descuento: valor antes de descuentos. */
  grossSubtotal?: number;
  /** Descuento propio de la línea. */
  lineDiscount?: number;
  /** Descuento total de la línea (propio + su parte del de la venta). */
  discount?: number;
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
  tax_total: number;
  /** Todos los descuentos de la venta. */
  discount_total?: number;
  /** Descuento a toda la venta (aparte de los de cada producto). */
  global_discount?: number;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_kind: "anulacion" | "devolucion" | null;
  void_reason: string | null;
  customer_id: string | null;
  customer_snapshot: CustomerSnapshot | null;
  sale_number: number | null;
  payment_method: PaymentMethod;
  pay_cash: number;
  pay_nequi: number;
  pay_daviplata: number;
  pay_llave: number;
  pay_tarjeta: number;
  pay_otro: number;
  /** Nombre del medio "Otro" al momento de la venta. */
  pay_otro_label: string | null;
  /** Valor fiado. */
  pay_credito: number;
  /** Lo que falta por pagar del fiado. */
  credit_balance: number;
  credit_due_date: string | null;
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
  discountType?: "pct" | "amount";
  discountValue?: number;
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
  returns_count: number;
  returns_total: number;
  returns_cash: number;
  returns_nequi: number;
  returns_daviplata: number;
  returns_llave: number;
  sales_tarjeta: number;
  sales_otro: number;
  sales_credito: number;
  returns_tarjeta: number;
  returns_otro: number;
  returns_credito: number;
  abonos_count: number;
  abonos_total: number;
  abonos_cash: number;
  abonos_nequi: number;
  abonos_daviplata: number;
  abonos_llave: number;
  abonos_tarjeta: number;
  abonos_otro: number;
  /** Compras de contado pagadas desde la caja. */
  purchases_cash: number;
  /** Abonos a proveedores pagados desde la caja. */
  supplier_payments_cash: number;
};

export type Supplier = {
  id: string;
  organization_id: string;
  nombre: string;
  nit: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseItem = {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  previousCost: number;
  newCost: number;
  previousSalePrice: number;
  salePrice: number;
};

export type Purchase = {
  id: string;
  organization_id: string;
  purchase_number: number;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  purchase_date: string;
  items: PurchaseItem[];
  total: number;
  payment_type: "contado" | "credito";
  pay_source: "caja" | "externo" | null;
  balance: number;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  /** Foto/PDF de la factura del proveedor (migración 027). */
  file_path: string | null;
};

export type SupplierPayment = {
  id: string;
  organization_id: string;
  purchase_id: string;
  supplier_id: string | null;
  amount: number;
  source: "caja" | "externo";
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
};

export type CustomerPayment = {
  id: string;
  organization_id: string;
  customer_id: string | null;
  customer_name: string;
  amount: number;
  method: AbonoMethod;
  method_label: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

export type CustomerPaymentAllocation = {
  payment_id: string;
  sale_id: string;
  organization_id: string;
  amount: number;
};

export type LowStockRow = {
  product_id: string;
  name: string;
  barcode: string | null;
  category_id: string;
  category_name: string;
  category_icon: string;
  quantity: number;
  min_stock: number;
  own_min: boolean;
  last_supplier_id: string | null;
  last_supplier_name: string | null;
  last_unit_cost: number | null;
  last_purchase_date: string | null;
};

export type CarteraRow = {
  customer_id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  credit_limit: number | null;
  sales_count: number;
  debt: number;
  current_amount: number;
  overdue_1_30: number;
  overdue_31_60: number;
  overdue_61_90: number;
  overdue_90: number;
  oldest_due: string | null;
};

export type DailySales = { day: string; sales_count: number; total: number };

export type PaymentInput =
  | { method: "efectivo" }
  | { method: "transferencia"; channel: TransferChannel }
  | { method: "tarjeta" }
  | { method: "otro" }
  | { method: "credito" }
  | {
      method: "mixto";
      efectivo: number;
      nequi: number;
      daviplata: number;
      llave: number;
      tarjeta: number;
      otro: number;
      credito: number;
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
      sale_drafts: {
        Row: SaleDraft;
        Insert: Partial<SaleDraft> & Pick<SaleDraft, "organization_id" | "state">;
        Update: Partial<SaleDraft>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Partial<Supplier> & Pick<Supplier, "organization_id" | "nombre">;
        Update: Partial<Supplier>;
        Relationships: [];
      };
      purchases: {
        Row: Purchase;
        Insert: Partial<Purchase> & Pick<Purchase, "organization_id">;
        Update: Partial<Purchase>;
        Relationships: [];
      };
      supplier_payments: {
        Row: SupplierPayment;
        Insert: Partial<SupplierPayment> & Pick<SupplierPayment, "organization_id" | "purchase_id" | "amount" | "source">;
        Update: Partial<SupplierPayment>;
        Relationships: [];
      };
      customer_payments: {
        Row: CustomerPayment;
        Insert: Partial<CustomerPayment> &
          Pick<CustomerPayment, "organization_id" | "customer_name" | "amount" | "method">;
        Update: Partial<CustomerPayment>;
        Relationships: [];
      };
      customer_payment_allocations: {
        Row: CustomerPaymentAllocation;
        Insert: CustomerPaymentAllocation;
        Update: Partial<CustomerPaymentAllocation>;
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
          p_discount?: { type: "pct" | "amount"; value: number } | null;
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
        Args: { p_sale_id: string; p_kind?: string; p_reason?: string | null };
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
      create_purchase: {
        Args: {
          p_supplier_id: string | null;
          p_invoice_number: string | null;
          p_purchase_date: string;
          p_items: { productId: string; quantity: number; unitCost: number; salePrice?: number }[];
          p_payment: { type: "contado"; source: "caja" | "externo" } | { type: "credito"; days: number };
          p_notes?: string | null;
        };
        Returns: { purchase_id: string; purchase_number: number; total: number }[];
      };
      void_purchase: {
        Args: { p_purchase_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      register_supplier_payment: {
        Args: { p_purchase_id: string; p_amount: number; p_source: "caja" | "externo"; p_notes?: string | null };
        Returns: string;
      };
      void_supplier_payment: {
        Args: { p_payment_id: string };
        Returns: undefined;
      };
      register_customer_payment: {
        Args: {
          p_customer_id: string;
          p_amount: number;
          p_method: AbonoMethod;
          p_sale_id?: string | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      void_customer_payment: {
        Args: { p_payment_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      low_stock_products: {
        Args: Record<string, never>;
        Returns: LowStockRow[];
      };
      low_stock_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      set_purchase_file: {
        Args: { p_purchase_id: string; p_file_path: string | null };
        Returns: string | null;
      };
      cartera_resumen: {
        Args: Record<string, never>;
        Returns: CarteraRow[];
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

export type DraftDiscount = { type: "pct" | "amount"; value: string };

export type SaleDraftState = {
  lines: { productId: string; quantity: number; discount?: DraftDiscount | null }[];
  /** Descuento a toda la venta. */
  globalDiscount?: DraftDiscount | null;
  customerMode: "none" | "existing" | "new";
  selectedCustomer: Cliente | null;
  newCustomer: { nombre: string; documento: string; telefono: string; direccion: string };
  customerEmail: string;
  whatsapp: string;
  cashReceived: string;
  payMethod: PaymentMethod;
  channel: TransferChannel;
  /** Ventas en espera viejas no traen tarjeta, otro ni credito. */
  mixed: {
    efectivo: string;
    nequi: string;
    daviplata: string;
    llave: string;
    tarjeta?: string;
    otro?: string;
    credito?: string;
  };
};

export type SaleDraft = {
  id: string;
  organization_id: string;
  state: SaleDraftState;
  total: number;
  created_by: string | null;
  created_by_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
};
