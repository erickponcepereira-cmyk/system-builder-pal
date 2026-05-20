import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

async function getCoachIdForUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (!data || data.role !== "admin") throw new Error("Apenas administradores");
}

export type CrossSaleRow = {
  id: string;
  amount: number;
  isCrossSale: boolean;
  createdAt: string;
  sellerCoachName: string | null;
  orderNumber: string | null;
};

/** Master Coach cross-sales summary: total + recent entries. */
export const getMyMasterCoachCrossSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ total: number; crossTotal: number; rows: CrossSaleRow[] }> => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) return { total: 0, crossTotal: 0, rows: [] };

    const { data: comms } = await supabaseAdmin
      .from("master_coach_commissions")
      .select("id, amount, is_cross_sale, created_at, seller_coach_id, order_id")
      .eq("master_coach_id", coachId)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows: CrossSaleRow[] = [];
    let total = 0;
    let crossTotal = 0;

    if (comms && comms.length) {
      const sellerIds = [...new Set(comms.map((c: any) => c.seller_coach_id).filter(Boolean))];
      const orderIds = [...new Set(comms.map((c: any) => c.order_id).filter(Boolean))];

      const [{ data: sellers }, { data: orders }] = await Promise.all([
        sellerIds.length
          ? supabaseAdmin.from("coaches").select("id, profiles:profile_id(name, full_name)").in("id", sellerIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabaseAdmin.from("store_orders").select("id, order_number").in("id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const sellerMap = new Map((sellers || []).map((s: any) => [s.id, s.profiles?.name || s.profiles?.full_name || null]));
      const orderMap = new Map((orders || []).map((o: any) => [o.id, o.order_number]));

      for (const c of comms as any[]) {
        const amt = Number(c.amount || 0);
        total += amt;
        if (c.is_cross_sale) crossTotal += amt;
        rows.push({
          id: c.id,
          amount: amt,
          isCrossSale: !!c.is_cross_sale,
          createdAt: c.created_at,
          sellerCoachName: sellerMap.get(c.seller_coach_id) ?? null,
          orderNumber: orderMap.get(c.order_id) ?? null,
        });
      }
    }
    return { total, crossTotal, rows };
  });

/** Admin: assigned nutritionist for an order. */
export const getOrderNutritionist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("sale_nutritionist_assignments")
      .select("id, nutritionist_coach_id, assigned_at, is_manual_override")
      .eq("order_id", data.orderId)
      .maybeSingle();
    if (!row) return null;
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, profiles:profile_id(name, full_name, email)")
      .eq("id", row.nutritionist_coach_id).maybeSingle();
    return {
      id: row.id,
      nutritionistCoachId: row.nutritionist_coach_id,
      assignedAt: row.assigned_at,
      isManualOverride: !!row.is_manual_override,
      name: (coach as any)?.profiles?.name || (coach as any)?.profiles?.full_name || "—",
      email: (coach as any)?.profiles?.email || null,
    };
  });

/** Admin: list all coaches with nutritionist_partner badge. */
export const listNutritionistPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: badges } = await supabaseAdmin
      .from("coach_badges").select("coach_id").eq("badge_key", "nutritionist_partner");
    const ids = (badges || []).map((b: any) => b.coach_id);
    if (!ids.length) return [];
    const { data: coaches } = await supabaseAdmin
      .from("coaches").select("id, profiles:profile_id(name, full_name, email)").in("id", ids);
    return (coaches || []).map((c: any) => ({
      id: c.id,
      name: c.profiles?.name || c.profiles?.full_name || "—",
      email: c.profiles?.email || null,
    }));
  });

/** Admin: manually override the nutritionist assigned to an order. */
export const overrideOrderNutritionist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; nutritionistCoachId: string }) =>
    z.object({
      orderId: z.string().uuid(),
      nutritionistCoachId: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("sale_nutritionist_assignments")
      .upsert(
        {
          order_id: data.orderId,
          nutritionist_coach_id: data.nutritionistCoachId,
          is_manual_override: true,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: "order_id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
