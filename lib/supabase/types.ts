export type UserRole = "super_admin" | "owner" | "auxiliar";
export type MovementType = "venta" | "gasto";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  max_auxiliares: number;
  max_categorias: number;
  max_productos_por_categoria: number;
  is_active: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  organization_id: string | null;
  username: string;
  full_name: string;
  role: UserRole;
  auth_email: string;
  created_at: string;
}

export interface ModuleDef {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price: number;
  created_at: string;
}

export interface OrganizationModule {
  organization_id: string;
  module_id: string;
  enabled: boolean;
  enabled_at: string | null;
}

export interface Category {
  id: string;
  organization_id: string;
  name: string;
  icon: string;
  color: string;
  image_url: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  organization_id: string;
  category_id: string;
  name: string;
  quantity: number;
  description: string | null;
  purchase_price: number;
  sale_price: number;
  created_at: string;
  updated_at: string;
}

export interface Movement {
  id: string;
  organization_id: string;
  type: MovementType;
  amount: number;
  description: string | null;
  occurred_at: string;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  organization_id: string;
  items: SaleItem[];
  total: number;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
}

export interface Invoice {
  id: string;
  organization_id: string;
  provider: string;
  invoice_number: string;
  amount: number;
  occurred_at: string;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  username: string;
  role: UserRole;
  action: string;
  details: string | null;
  created_at: string;
}

// Tipado mínimo compatible con el cliente de Supabase; se puede reemplazar
// por el tipo generado con `supabase gen types typescript` cuando el
// proyecto esté creado.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
