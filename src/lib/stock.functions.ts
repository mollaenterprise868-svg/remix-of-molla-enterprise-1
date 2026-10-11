import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UNITS } from "@/lib/molla";

export type ProductInput = {
  name: string;
  barcode?: string | null;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  price: number;
  quantity: number;
  low_stock_level?: number | null;
};

function clean(row: ProductInput) {
  const name = String(row.name ?? "").trim();
  if (!name) throw new Error("Every product needs a name");
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  if (!Number.isFinite(price) || price < 0) throw new Error(`Price for "${name}" is not valid`);
  if (!Number.isFinite(quantity) || quantity < 0)
    throw new Error(`Quantity for "${name}" is not valid`);
  const unit = String(row.unit ?? "item").trim().toLowerCase();
  if (!(UNITS as readonly string[]).includes(unit))
    throw new Error(`Unit "${unit}" for "${name}" is not supported`);
  const low = Number(row.low_stock_level ?? 5);
  return {
    name,
    barcode: row.barcode ? String(row.barcode).trim() : null,
    sku: row.sku ? String(row.sku).trim() : null,
    category: (row.category ? String(row.category).trim() : "") || "General",
    unit,
    price,
    quantity,
    low_stock_level: Number.isFinite(low) && low >= 0 ? low : 5,
  };
}

type AuthedContext = { supabase: any; userId: string };

async function assertManager(context: AuthedContext) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "manager",
  });
  if (error) throw new Error(`Could not check your role: ${error.message}`);
  if (!data) throw new Error("Only managers can change stock");
  return context.supabase;
}

/** Managers save one or many products. Everyone else is refused. */
export const saveProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: ProductInput[] }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertManager(context);
    const rows = (data.rows ?? []).map(clean);
    if (rows.length === 0) throw new Error("There is nothing to save");
    const { error } = await admin.from("products").insert(rows);
    if (error) throw new Error(error.message);
    return { saved: rows.length };
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; price: number; quantity: number }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertManager(context);
    const price = Number(data.price);
    const quantity = Number(data.quantity);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 0)
      throw new Error("Price and quantity must be 0 or more");
    const { error } = await admin.from("products").update({ price, quantity }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const admin = await assertManager(context);
    const { error } = await admin.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
