import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PartnerReport = {
  range: { from: string; to: string };
  summary: {
    visits: number;
    unique_visitors: number;
    visits_via_coach: number;
    paid_orders: number;
    revenue_gross: number;
    revenue_net: number;
    freebies_redeemed: number;
    coupons_generated: number;
    coupons_used: number;
    coupon_conversion_pct: number;
  };
  by_product: Array<{ product_id: string; product_name: string; kind: "free" | "paid"; qty: number; revenue: number }>;
  by_category: Array<{ category_id: string | null; category_name: string; qty: number; revenue: number }>;
  top_coaches: Array<{ coach_id: string; coach_name: string; visits: number; buyers: number; revenue: number }>;
  recent_visits: Array<{ id: string; visited_at: string; student_name: string; student_photo: string | null; coach_name: string | null }>;
  coupons_recent: Array<{ id: string; token: string; status: string; created_at: string; redeemed_at: string | null; product_name: string | null; student_name: string }>;
};

const Range = z.object({
  from: z.string().min(8),
  to: z.string().min(8),
});

export const getPartnerReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Range.parse(d))
  .handler(async ({ data, context }): Promise<PartnerReport> => {
    const { userId } = context;

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");

    const { data: partner } = await supabaseAdmin
      .from("partners").select("id").eq("profile_id", profile.id).maybeSingle();
    if (!partner) throw new Error("Empresa parceira não encontrada");

    const partnerId = partner.id as string;
    const fromTs = `${data.from}T00:00:00`;
    const toTs = `${data.to}T23:59:59`;

    // Visits
    const { data: visits } = await supabaseAdmin
      .from("partner_visits")
      .select("id, visited_at, student_id")
      .eq("partner_id", partnerId)
      .gte("visited_at", fromTs)
      .lte("visited_at", toTs)
      .order("visited_at", { ascending: false });
    const visitRows = (visits as { id: string; visited_at: string; student_id: string }[]) || [];

    // Orders (paid)
    const { data: orders } = await supabaseAdmin
      .from("partner_product_orders")
      .select("id, status, gross_amount, partner_net_amount, partner_product_id, student_id, selling_coach_id, paid_at, created_at")
      .eq("partner_id", partnerId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs);
    type OrderRow = { id: string; status: string; gross_amount: number; partner_net_amount: number; partner_product_id: string | null; student_id: string; selling_coach_id: string | null; paid_at: string | null; created_at: string };
    const orderRows = (orders as OrderRow[]) || [];
    const paidOrders = orderRows.filter((o) => o.status === "paid");

    // Coupons
    const { data: coupons } = await supabaseAdmin
      .from("partner_coupons")
      .select("id, token, status, created_at, redeemed_at, product_name, student_id, partner_product_id")
      .eq("partner_id", partnerId)
      .gte("created_at", fromTs)
      .lte("created_at", toTs)
      .order("created_at", { ascending: false });
    type CouponRow = { id: string; token: string; status: string; created_at: string; redeemed_at: string | null; product_name: string | null; student_id: string; partner_product_id: string };
    const couponRows = (coupons as CouponRow[]) || [];

    // Freebies redeemed for products that belong to this partner (none today — partner_products kind=free are discounts; freebies are admin-side). Skip — set 0.
    const freebiesRedeemed = 0;

    // Resolve students for names/photos and coach mapping
    const studentIds = Array.from(new Set([
      ...visitRows.map((v) => v.student_id),
      ...paidOrders.map((o) => o.student_id),
      ...couponRows.map((c) => c.student_id),
    ]));

    let studentMap: Record<string, { name: string; photo: string | null; coach_id: string | null }> = {};
    if (studentIds.length) {
      const { data: students } = await supabaseAdmin
        .from("students")
        .select("id, coach_id, profiles!students_profile_id_fkey(name, photo_url, avatar_url)")
        .in("id", studentIds);
      type S = { id: string; coach_id: string | null; profiles: { name: string; photo_url: string | null; avatar_url: string | null } | null };
      studentMap = Object.fromEntries(((students as unknown as S[]) || []).map((s) => [s.id, {
        name: s.profiles?.name || "Aluno",
        photo: s.profiles?.photo_url || s.profiles?.avatar_url || null,
        coach_id: s.coach_id,
      }]));
    }

    const coachIds = Array.from(new Set(Object.values(studentMap).map((s) => s.coach_id).filter(Boolean))) as string[];
    let coachNameMap: Record<string, string> = {};
    if (coachIds.length) {
      const { data: coaches } = await supabaseAdmin
        .from("coaches")
        .select("id, profiles!coaches_profile_id_fkey(name)")
        .in("id", coachIds);
      type C = { id: string; profiles: { name: string } | null };
      coachNameMap = Object.fromEntries(((coaches as unknown as C[]) || []).map((c) => [c.id, c.profiles?.name || "Coach"]));
    }

    // Products / categories
    const productIds = Array.from(new Set([
      ...paidOrders.map((o) => o.partner_product_id).filter(Boolean) as string[],
    ]));
    let productMap: Record<string, { name: string; kind: "free" | "paid"; category_id: string | null }> = {};
    let categoryMap: Record<string, string> = {};
    if (productIds.length) {
      const { data: products } = await supabaseAdmin
        .from("partner_products")
        .select("id, name, kind, category_id")
        .in("id", productIds);
      type P = { id: string; name: string; kind: "free" | "paid"; category_id: string | null };
      productMap = Object.fromEntries(((products as P[]) || []).map((p) => [p.id, { name: p.name, kind: p.kind, category_id: p.category_id }]));
      const catIds = Array.from(new Set(Object.values(productMap).map((p) => p.category_id).filter(Boolean))) as string[];
      if (catIds.length) {
        const { data: cats } = await supabaseAdmin
          .from("store_categories").select("id, name").in("id", catIds);
        categoryMap = Object.fromEntries(((cats as { id: string; name: string }[]) || []).map((c) => [c.id, c.name]));
      }
    }

    // Aggregations
    const visitsViaCoach = visitRows.filter((v) => studentMap[v.student_id]?.coach_id).length;
    const uniqueVisitors = new Set(visitRows.map((v) => v.student_id)).size;
    const revenueGross = paidOrders.reduce((s, o) => s + Number(o.gross_amount || 0), 0);
    const revenueNet = paidOrders.reduce((s, o) => s + Number(o.partner_net_amount || 0), 0);

    const couponsGenerated = couponRows.length;
    const couponsUsed = couponRows.filter((c) => c.status === "used").length;
    const couponConversion = couponsGenerated === 0 ? 0 : (couponsUsed / couponsGenerated) * 100;

    // By product
    const byProductMap: Record<string, { product_id: string; product_name: string; kind: "free" | "paid"; qty: number; revenue: number }> = {};
    for (const o of paidOrders) {
      if (!o.partner_product_id) continue;
      const p = productMap[o.partner_product_id];
      const key = o.partner_product_id;
      if (!byProductMap[key]) byProductMap[key] = { product_id: key, product_name: p?.name || "Produto", kind: p?.kind || "paid", qty: 0, revenue: 0 };
      byProductMap[key].qty += 1;
      byProductMap[key].revenue += Number(o.gross_amount || 0);
    }

    // By category
    const byCategoryMap: Record<string, { category_id: string | null; category_name: string; qty: number; revenue: number }> = {};
    for (const o of paidOrders) {
      const cat = o.partner_product_id ? productMap[o.partner_product_id]?.category_id || null : null;
      const key = cat || "_uncat";
      if (!byCategoryMap[key]) byCategoryMap[key] = { category_id: cat, category_name: cat ? (categoryMap[cat] || "Sem categoria") : "Sem categoria", qty: 0, revenue: 0 };
      byCategoryMap[key].qty += 1;
      byCategoryMap[key].revenue += Number(o.gross_amount || 0);
    }

    // Top coaches (visits + revenue brought via their students)
    const topMap: Record<string, { coach_id: string; coach_name: string; visits: number; buyers: Set<string>; revenue: number }> = {};
    for (const v of visitRows) {
      const cid = studentMap[v.student_id]?.coach_id;
      if (!cid) continue;
      if (!topMap[cid]) topMap[cid] = { coach_id: cid, coach_name: coachNameMap[cid] || "Coach", visits: 0, buyers: new Set(), revenue: 0 };
      topMap[cid].visits += 1;
    }
    for (const o of paidOrders) {
      const cid = studentMap[o.student_id]?.coach_id;
      if (!cid) continue;
      if (!topMap[cid]) topMap[cid] = { coach_id: cid, coach_name: coachNameMap[cid] || "Coach", visits: 0, buyers: new Set(), revenue: 0 };
      topMap[cid].buyers.add(o.student_id);
      topMap[cid].revenue += Number(o.gross_amount || 0);
    }
    const topCoaches = Object.values(topMap)
      .map((t) => ({ coach_id: t.coach_id, coach_name: t.coach_name, visits: t.visits, buyers: t.buyers.size, revenue: t.revenue }))
      .sort((a, b) => b.revenue - a.revenue || b.visits - a.visits)
      .slice(0, 15);

    return {
      range: { from: data.from, to: data.to },
      summary: {
        visits: visitRows.length,
        unique_visitors: uniqueVisitors,
        visits_via_coach: visitsViaCoach,
        paid_orders: paidOrders.length,
        revenue_gross: revenueGross,
        revenue_net: revenueNet,
        freebies_redeemed: freebiesRedeemed,
        coupons_generated: couponsGenerated,
        coupons_used: couponsUsed,
        coupon_conversion_pct: couponConversion,
      },
      by_product: Object.values(byProductMap).sort((a, b) => b.revenue - a.revenue),
      by_category: Object.values(byCategoryMap).sort((a, b) => b.revenue - a.revenue),
      top_coaches: topCoaches,
      recent_visits: visitRows.slice(0, 30).map((v) => ({
        id: v.id,
        visited_at: v.visited_at,
        student_name: studentMap[v.student_id]?.name || "Aluno",
        student_photo: studentMap[v.student_id]?.photo || null,
        coach_name: studentMap[v.student_id]?.coach_id ? coachNameMap[studentMap[v.student_id].coach_id!] || null : null,
      })),
      coupons_recent: couponRows.slice(0, 30).map((c) => ({
        id: c.id,
        token: c.token,
        status: c.status,
        created_at: c.created_at,
        redeemed_at: c.redeemed_at,
        product_name: c.product_name,
        student_name: studentMap[c.student_id]?.name || "Aluno",
      })),
    };
  });
