"use server";

import { revalidatePath } from "next/cache";

import { requireProfile } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";
import { categorySchema, productSchema } from "@/lib/validations/catalogo";

type ActionResult = { error?: string } | void;

export async function createCategory(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "📦",
    color: formData.get("color") || "#F59E0B",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    organization_id: profile.organization_id,
    name: parsed.data.name,
    icon: parsed.data.icon,
    color: parsed.data.color,
  });
  if (error) return { error: "No se pudo crear la categoría" };

  await logActivity(profile, "Creó categoría", parsed.data.name);
  revalidatePath("/dashboard/catalogo");
}

export async function updateCategory(
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    icon: formData.get("icon") || "📦",
    color: formData.get("color") || "#F59E0B",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", categoryId);
  if (error) return { error: "No se pudo actualizar la categoría" };

  await logActivity(profile, "Editó categoría", parsed.data.name);
  revalidatePath("/dashboard/catalogo");
}

export async function deleteCategory(categoryId: string, categoryName: string) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("categories").delete().eq("id", categoryId);
  if (error) return { error: "No se pudo eliminar la categoría" };

  await logActivity(profile, "Eliminó categoría", categoryName);
  revalidatePath("/dashboard/catalogo");
}

export async function createProduct(
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();
  if (!profile.organization_id) return { error: "Sin organización asociada" };

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    description: formData.get("description") ?? "",
    purchasePrice: formData.get("purchasePrice"),
    salePrice: formData.get("salePrice"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    organization_id: profile.organization_id,
    category_id: categoryId,
    name: parsed.data.name,
    quantity: parsed.data.quantity,
    description: parsed.data.description || null,
    purchase_price: parsed.data.purchasePrice,
    sale_price: parsed.data.salePrice,
  });
  if (error) return { error: "No se pudo crear el producto" };

  await logActivity(profile, "Creó producto", parsed.data.name);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
  revalidatePath("/dashboard/catalogo");
}

export async function updateProduct(
  productId: string,
  categoryId: string,
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    quantity: formData.get("quantity"),
    description: formData.get("description") ?? "",
    purchasePrice: formData.get("purchasePrice"),
    salePrice: formData.get("salePrice"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      quantity: parsed.data.quantity,
      description: parsed.data.description || null,
      purchase_price: parsed.data.purchasePrice,
      sale_price: parsed.data.salePrice,
    })
    .eq("id", productId);
  if (error) return { error: "No se pudo actualizar el producto" };

  await logActivity(profile, "Editó producto", parsed.data.name);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
}

export async function deleteProduct(
  productId: string,
  categoryId: string,
  productName: string
) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) return { error: "No se pudo eliminar el producto" };

  await logActivity(profile, "Eliminó producto", productName);
  revalidatePath(`/dashboard/catalogo/${categoryId}`);
  revalidatePath("/dashboard/catalogo");
}
