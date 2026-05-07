import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SaleClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export type SaleProduct = {
  id: string;
  kind: "challenge" | "digital" | "store";
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  originalPrice?: number | null;
  category?: string | null;
  commissionCoach?: number | null;
  commissionLevel1?: number | null;
  commissionLevel2?: number | null;
  commissionLevel3?: number | null;
  appFee?: number | null;
  stock?: number | null;
};

export type CoachSaleRow = {
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
  paymentMethod: string;
  clientName: string;
  productTitles: string;
  commissionAmount: number;
  commissionStatus: string | null;
};

async function getCoachIdForUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

/** Lists clients (students) of the current coach. */
export const listCoachClients = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaleClient[]> => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) return [];
    const { data } = await supabaseAdmin
      .from("students")
      .select("id, profiles:profile_id(name,email,phone)")
      .eq("coach_id", coachId);
    return (data || []).map((s: any) => ({
      id: s.id,
      name: s.profiles?.name || "Cliente",
      email: s.profiles?.email || null,
      phone: s.profiles?.phone || null,
    }));
  });

/** Lists all sellable products: challenges (products), digital_products, store_products. */
export const listSellableProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async (): Promise<SaleProduct[]> => {
    const [{ data: challenges }, { data: digitals }, { data: stores }] = await Promise.all([
      supabaseAdmin.from("products").select("id,name,description,price,original_price,type,image_url,commission_coach,commission_level1,commission_level2,commission_level3,app_fee").eq("status", "active"),
      supabaseAdmin.from("digital_products").select("id,title,description,price,original_price,type,cover_url").eq("status", "active"),
      supabaseAdmin.from("store_products").select("id,name,description,price,original_price,category,image_url,stock").eq("status", "active"),
    ]);
    const out: SaleProduct[] = [];
    (challenges || []).forEach((p: any) => out.push({
      id: p.id, kind: "challenge", title: p.name, description: p.description, imageUrl: p.image_url,
      price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
      category: p.type,
      commissionCoach: p.commission_coach, commissionLevel1: p.commission_level1,
      commissionLevel2: p.commission_level2, commissionLevel3: p.commission_level3,
      appFee: p.app_fee,
    }));
    (digitals || []).forEach((p: any) => out.push({
      id: p.id, kind: "digital", title: p.title, description: p.description, imageUrl: p.cover_url,
      price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
      category: p.type,
    }));
    (stores || []).forEach((p: any) => out.push({
      id: p.id, kind: "store", title: p.name, description: p.description, imageUrl: p.image_url,
      price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
      category: p.category, stock: p.stock,
    }));
    return out;
  });

export type CartInput = {
  clientId: string;
  items: Array<{
    productId: string;
    kind: "challenge" | "digital" | "store";
    title: string;
    unitPrice: number;
    quantity: number;
  }>;
  paymentMethod: "pix" | "credit_card" | "debit_card";
  notes?: string | null;
};

/** Creates a store_order for a coach selling to one of their clients. Returns order number + public pay link. */
export const createCoachSale = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input as CartInput)
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) throw new Error("Coach não encontrado");
    if (!data.items.length) throw new Error("Carrinho vazio");

    // Validate the client belongs to this coach
    const { data: client } = await supabaseAdmin
      .from("students").select("id,coach_id").eq("id", data.clientId).maybeSingle();
    if (!client || client.coach_id !== coachId) throw new Error("Cliente não pertence ao coach");

    const subtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("store_orders")
      .insert({
        student_id: data.clientId,
        status: "pending",
        payment_method: data.paymentMethod,
        subtotal,
        payment_fee: 0,
        tax_amount: 0,
        total_amount: subtotal,
        notes: data.notes || null,
        metadata: { created_by_coach_id: coachId, source: "coach_sale" },
      })
      .select("id, order_number, total_amount")
      .single();
    if (orderErr || !order) throw new Error(orderErr?.message || "Falha ao criar pedido");

    const itemsPayload = data.items.map((i) => ({
      order_id: order.id,
      product_kind: i.kind,
      ...(i.kind === "challenge" ? { product_id: i.productId } : {}),
      ...(i.kind === "digital" ? { digital_product_id: i.productId } : {}),
      ...(i.kind === "store" ? { store_product_id: i.productId } : {}),
      title: i.title,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      total_price: i.unitPrice * i.quantity,
    }));
    const { error: itemsErr } = await supabaseAdmin.from("store_order_items").insert(itemsPayload);
    if (itemsErr) throw new Error(itemsErr.message);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      total: Number(order.total_amount),
      payUrl: `/pay/${order.order_number}`,
    };
  });
