import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SaleClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  coachName?: string | null;
};

export type SaleProduct = {
  id: string;
  kind: "challenge" | "digital" | "store" | "item";
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
    // Master coach? Then list ALL students in the system (not limited to network).
    const { data: master } = await supabaseAdmin
      .rpc("is_master_coach" as never, { _coach_id: coachId } as never);
    const isMaster = !!master;
    let query = supabaseAdmin
      .from("students")
      .select("id, coach_id, profiles:profile_id(name,email,phone)");
    if (!isMaster) query = query.eq("coach_id", coachId);
    const { data } = await query;
    const rows = (data || []) as any[];
    // For master view, resolve coach names for cross-coach clients
    const coachNameById = new Map<string, string>();
    if (isMaster) {
      const otherCoachIds = Array.from(new Set(rows.map((r) => r.coach_id).filter((id) => id && id !== coachId)));
      if (otherCoachIds.length) {
        const { data: coachesData } = await supabaseAdmin
          .from("coaches")
          .select("id, profiles!coaches_profile_id_fkey(name)")
          .in("id", otherCoachIds);
        ((coachesData as any[]) || []).forEach((cc) => coachNameById.set(cc.id, cc.profiles?.name || "Coach"));
      }
    }
    return rows.map((s) => ({
      id: s.id,
      name: s.profiles?.name || "Cliente",
      email: s.profiles?.email || null,
      phone: s.profiles?.phone || null,
      coachName: isMaster && s.coach_id !== coachId ? (coachNameById.get(s.coach_id) || "Outro coach") : null,
    }));
  });

/** Lists all sellable products: challenges (products), digital_products, store_products. */
export const listSellableProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaleProduct[]> => {
    // Resolve coach + their badges, used to filter products with required_badge
    const coachId = await getCoachIdForUser(context.userId);
    const { data: badgeRows } = coachId
      ? await supabaseAdmin.from("coach_badges").select("badge_key").eq("coach_id", coachId)
      : { data: [] as { badge_key: string }[] };
    const myBadges = new Set((badgeRows || []).map((b: any) => b.badge_key as string));
    const canSell = (required: string | null | undefined) => !required || myBadges.has(required);

    const [{ data: challenges }, { data: digitals }, { data: stores }, { data: items }] = await Promise.all([
      supabaseAdmin.from("products").select("id,name,description,price,original_price,type,image_url,commission_coach,commission_level1,commission_level2,commission_level3,app_fee,required_badge").eq("status", "active").is("kind", null),
      supabaseAdmin.from("digital_products").select("id,title,description,price,original_price,type,cover_url").eq("status", "active"),
      supabaseAdmin.from("store_products").select("id,name,description,price,original_price,category,image_url,stock").eq("status", "active"),
      supabaseAdmin.from("products").select("id,name,short_description,description,price,original_price,kind,image_url,stock,commission_coach,commission_level1,commission_level2,commission_level3,required_badge").eq("is_active", true).not("kind", "is", null),
    ]);
    const out: SaleProduct[] = [];
    (challenges || []).filter((p: any) => canSell(p.required_badge)).forEach((p: any) => out.push({
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
    (items || []).filter((p: any) => canSell(p.required_badge)).forEach((p: any) => out.push({
      id: p.id, kind: "item", title: p.name, description: p.short_description || p.description, imageUrl: p.image_url,
      price: Number(p.price || 0), originalPrice: p.original_price ? Number(p.original_price) : null,
      category: p.kind, stock: p.stock,
      commissionCoach: p.commission_coach, commissionLevel1: p.commission_level1,
      commissionLevel2: p.commission_level2, commissionLevel3: p.commission_level3,
    }));
    return out;
  });

export type CartInput = {
  clientId: string;
  items: Array<{
    productId: string;
    kind: "challenge" | "digital" | "store" | "item";
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

    // Validate the client exists. Master Coaches may sell to clients of other coaches;
    // every other coach can only sell to their own clients.
    const { data: client } = await supabaseAdmin
      .from("students").select("id,coach_id").eq("id", data.clientId).maybeSingle();
    if (!client) throw new Error("Cliente não encontrado");

    const titularCoachId: string | null = (client as { coach_id: string | null }).coach_id ?? null;
    let isMasterCrossSale = false;
    if (titularCoachId !== coachId) {
      const { data: masterCheck } = await supabaseAdmin
        .rpc("is_master_coach" as never, { _coach_id: coachId } as never);
      if (!masterCheck) throw new Error("Cliente não pertence ao coach");
      if (titularCoachId) isMasterCrossSale = true;
    }

    const subtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

    const orderMetadata: Record<string, unknown> = {
      created_by_coach_id: coachId,
      source: "coach_sale",
    };
    if (isMasterCrossSale && titularCoachId) {
      orderMetadata.master_cross_sale = {
        seller_coach_id: coachId,
        titular_coach_id: titularCoachId,
        master_pct: 10,
      };
    }

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
        metadata: orderMetadata,
      } as never)
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
      metadata: i.kind === "item" ? { store_item_id: i.productId } : {},
    }));
    const { error: itemsErr } = await supabaseAdmin.from("store_order_items").insert(itemsPayload as never);
    if (itemsErr) throw new Error(itemsErr.message);

    // ─── Master Coach cross-sale tracking (informational) ───
    // A divisão real 10/90 é aplicada pelo trigger SQL `apply_master_cross_sale_split`
    // sobre a tabela `commissions` quando a transação for paga. Aqui apenas registramos
    // o evento na tabela `master_coach_commissions` para relatórios.
    if (isMasterCrossSale) {
      try {
        const allProductIds = data.items
          .filter((i) => i.kind === "challenge" || i.kind === "item")
          .map((i) => i.productId);
        if (allProductIds.length) {
          const { data: prodRows } = await supabaseAdmin
            .from("products")
            .select("id, price, commission_coach")
            .in("id", allProductIds);
          const prodMap = new Map<string, { commission_coach: number }>();
          (prodRows || []).forEach((p) =>
            prodMap.set(p.id as string, { commission_coach: Number((p as { commission_coach: number }).commission_coach || 0) }),
          );

          const rows: Record<string, unknown>[] = [];
          for (const item of data.items) {
            const p = prodMap.get(item.productId);
            if (!p) continue;
            const baseCommission = item.unitPrice * item.quantity * (p.commission_coach / 100);
            const masterAmount = Math.round(baseCommission * 10) / 100;
            rows.push({
              order_id: order.id,
              product_id: item.productId,
              seller_coach_id: coachId,
              master_coach_id: coachId,
              is_cross_sale: true,
              base_commission: baseCommission,
              master_amount: masterAmount,
            });
          }
          if (rows.length) {
            await supabaseAdmin.from("master_coach_commissions").insert(rows as never);
          }
        }
      } catch (e) {
        console.error("master coach commission tracking failed:", e);
      }
    }

    // ─── Atribuição automática de Nutricionista desativada ───
    // Em breve haverá um seletor por produto. Por ora, nenhuma atribuição.


    return {
      orderId: order.id,
      orderNumber: order.order_number,
      total: Number(order.total_amount),
      payUrl: `/pay/${order.order_number}`,
    };
  });

/** Lista todas as vendas registradas pelo coach (ou para alunos do coach). */
export const listCoachSalesHistory = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachSaleRow[]> => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) return [];

    // Pedidos de alunos do coach OU pedidos com metadata.created_by_coach_id = coachId
    const { data: studentRows } = await supabaseAdmin
      .from("students").select("id").eq("coach_id", coachId);
    const studentIds = (studentRows || []).map((s: any) => s.id);

    const { data: orders } = await supabaseAdmin
      .from("store_orders")
      .select("id, order_number, status, total_amount, created_at, payment_method, student_id, metadata, students:student_id(profiles:profile_id(name)), store_order_items(title)")
      .or(
        [
          studentIds.length ? `student_id.in.(${studentIds.join(",")})` : null,
          `metadata->>created_by_coach_id.eq.${coachId}`,
        ].filter(Boolean).join(",")
      )
      .order("created_at", { ascending: false })
      .limit(200);

    const orderIds = (orders || []).map((o: any) => o.id);
    const { data: txs } = orderIds.length
      ? await supabaseAdmin
          .from("transactions")
          .select("id, metadata, status, gross_amount")
          .filter("metadata->>store_order_id", "in", `(${orderIds.join(",")})`)
      : { data: [] as any[] };
    const txByOrder = new Map<string, any>();
    (txs || []).forEach((t: any) => {
      const oid = t.metadata?.store_order_id;
      if (oid) txByOrder.set(oid, t);
    });

    const txIds = (txs || []).map((t: any) => t.id);
    const { data: comms } = txIds.length
      ? await supabaseAdmin
          .from("commissions")
          .select("transaction_id, amount, status, beneficiary_coach_id")
          .in("transaction_id", txIds)
          .eq("beneficiary_coach_id", coachId)
      : { data: [] as any[] };
    const commByTx = new Map<string, { amount: number; status: string | null }>();
    (comms || []).forEach((c: any) => {
      const prev = commByTx.get(c.transaction_id) || { amount: 0, status: c.status };
      commByTx.set(c.transaction_id, {
        amount: prev.amount + Number(c.amount || 0),
        status: c.status,
      });
    });

    return (orders || []).map((o: any) => {
      const tx = txByOrder.get(o.id);
      const comm = tx ? commByTx.get(tx.id) : null;
      const titles = ((o.store_order_items as any[]) || []).map((i) => i.title).join(", ");
      return {
        orderId: o.id,
        orderNumber: o.order_number,
        status: o.status,
        total: Number(o.total_amount || 0),
        createdAt: o.created_at,
        paymentMethod: o.payment_method,
        clientName: o.students?.profiles?.name || "Cliente",
        productTitles: titles || "—",
        commissionAmount: comm?.amount || 0,
        commissionStatus: comm?.status || null,
      };
    });
  });
