import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Endereço + prazo de entrega para pedidos físicos.
// ---------------------------------------------------------------------------

const ShippingSchema = z.object({
  shipping_zip: z.string().trim().min(5).max(20),
  shipping_address: z.string().trim().min(3).max(255),
  shipping_number: z.string().trim().min(1).max(20),
  shipping_reference: z.string().trim().min(1).max(255),
  shipping_location_url: z.string().trim().url().max(500).optional().or(z.literal("").transform(() => undefined)),
});

const AttachInput = ShippingSchema.extend({
  kind: z.enum(["store_order", "partner_product_order"]),
  order_id: z.string().uuid(),
  save_to_profile: z.boolean().optional().default(true),
  delivery_days: z.number().int().positive().max(365).optional().nullable(),
});

async function assertOwnsStudent(userId: string, studentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("students")
    .select("id, profiles!students_profile_id_fkey(user_id)")
    .eq("id", studentId)
    .maybeSingle();
  const uid = (data as any)?.profiles?.user_id;
  return !!uid && uid === userId;
}

export const attachShippingToOrder = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => AttachInput.parse(d))
  .handler(async ({ data, context }) => {
    const table = data.kind === "store_order" ? "store_orders" : "partner_product_orders";
    const { data: order } = await supabaseAdmin
      .from(table as any)
      .select("id, student_id, status, delivery_days")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Error("Pedido não encontrado");
    const isOwner = await assertOwnsStudent(context.userId, (order as any).student_id);
    if (!isOwner) throw new Error("Sem permissão para editar este pedido");

    const patch: Record<string, unknown> = {
      shipping_zip: data.shipping_zip,
      shipping_address: data.shipping_address,
      shipping_number: data.shipping_number,
      shipping_reference: data.shipping_reference,
      shipping_location_url: data.shipping_location_url || null,
    };
    if (data.delivery_days && !((order as any).delivery_days)) {
      patch.delivery_days = data.delivery_days;
    }

    const { error } = await supabaseAdmin.from(table as any).update(patch).eq("id", data.order_id);
    if (error) throw new Error(error.message);

    if (data.save_to_profile) {
      await supabaseAdmin
        .from("students")
        .update({
          shipping_zip: data.shipping_zip,
          shipping_address: data.shipping_address,
          shipping_number: data.shipping_number,
          shipping_reference: data.shipping_reference,
          shipping_location_url: data.shipping_location_url || null,
        } as any)
        .eq("id", (order as any).student_id);
    }

    return { ok: true };
  });

export const getMyShippingProfile = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) return null;
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, shipping_zip, shipping_address, shipping_number, shipping_reference, shipping_location_url")
      .eq("profile_id", (profile as any).id)
      .maybeSingle();
    return (student as any) || null;
  });

// ---------------------------------------------------------------------------
// Compras físicas em andamento
// ---------------------------------------------------------------------------

export type OngoingShippingOrder = {
  id: string;
  source: "store" | "partner" | "professional";
  order_number: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  delivery_started_at: string | null;
  delivery_days: number | null;
  product_name: string;
  amount: number;
  student: { id: string; name: string; email: string | null } | null;
  shipping: {
    zip: string | null;
    address: string | null;
    number: string | null;
    reference: string | null;
    location_url: string | null;
  };
};

const ScopeInput = z.object({
  scope: z.enum(["student", "partner", "professional", "admin"]),
  student_id: z.string().uuid().optional().nullable(),
  partner_id: z.string().uuid().optional().nullable(),
  coach_id: z.string().uuid().optional().nullable(),
});

export const getOngoingShippingOrders = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => ScopeInput.parse(d))
  .handler(async ({ data }): Promise<OngoingShippingOrder[]> => {
    // Fetch store_orders (Fitmind — items joined via store_order_items -> products)
    const results: OngoingShippingOrder[] = [];

    if (data.scope === "student" || data.scope === "admin") {
      let q = supabaseAdmin
        .from("store_orders")
        .select("id, order_number, status, created_at, paid_at, delivery_started_at, delivery_days, total_amount, student_id, shipping_zip, shipping_address, shipping_number, shipping_reference, shipping_location_url")
        .in("status", ["paid", "pending"])
        .not("delivery_days", "is", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data.scope === "student" && data.student_id) q = q.eq("student_id", data.student_id);
      const { data: rows } = await q;
      const orderIds = ((rows as any[]) || []).map((r) => r.id);
      const studentIds = Array.from(new Set(((rows as any[]) || []).map((r) => r.student_id).filter(Boolean)));
      const [{ data: items }, { data: studs }] = await Promise.all([
        orderIds.length
          ? supabaseAdmin.from("store_order_items").select("order_id, title, quantity").in("order_id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
        studentIds.length
          ? supabaseAdmin
              .from("students")
              .select("id, profile_id, profiles!students_profile_id_fkey(full_name, email)")
              .in("id", studentIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const itemMap = new Map<string, string>();
      ((items as any[]) || []).forEach((it) => {
        const cur = itemMap.get(it.order_id);
        const line = `${it.quantity || 1}× ${it.title || "Item"}`;
        itemMap.set(it.order_id, cur ? `${cur} + ${line}` : line);
      });
      const studMap = new Map<string, { id: string; name: string; email: string | null }>();
      ((studs as any[]) || []).forEach((s) =>
        studMap.set(s.id, { id: s.id, name: s.profiles?.full_name || "Aluno", email: s.profiles?.email || null }),
      );
      ((rows as any[]) || []).forEach((o) => {
        results.push({
          id: o.id,
          source: "store",
          order_number: o.order_number,
          status: o.status,
          created_at: o.created_at,
          paid_at: o.paid_at,
          delivery_started_at: o.delivery_started_at,
          delivery_days: o.delivery_days,
          product_name: itemMap.get(o.id) || "Pedido Fitmind",
          amount: Number(o.total_amount || 0),
          student: studMap.get(o.student_id) || null,
          shipping: {
            zip: o.shipping_zip,
            address: o.shipping_address,
            number: o.shipping_number,
            reference: o.shipping_reference,
            location_url: o.shipping_location_url,
          },
        });
      });
    }

    // partner_product_orders (parceiros e profissionais)
    let q2 = supabaseAdmin
      .from("partner_product_orders")
      .select("id, order_number, status, created_at, paid_at, delivery_started_at, delivery_days, gross_amount, student_id, partner_id, professional_coach_id, partner_product_id, professional_product_id, shipping_zip, shipping_address, shipping_number, shipping_reference, shipping_location_url")
      .in("status", ["paid", "pending"])
      .not("delivery_days", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.scope === "student" && data.student_id) q2 = q2.eq("student_id", data.student_id);
    if (data.scope === "partner" && data.partner_id) q2 = q2.eq("partner_id", data.partner_id);
    if (data.scope === "professional" && data.coach_id) q2 = q2.eq("professional_coach_id", data.coach_id);
    const { data: pp } = await q2;

    const partnerIds = Array.from(new Set(((pp as any[]) || []).map((r) => r.partner_product_id).filter(Boolean)));
    const profIds = Array.from(new Set(((pp as any[]) || []).map((r) => r.professional_product_id).filter(Boolean)));
    const studIds2 = Array.from(new Set(((pp as any[]) || []).map((r) => r.student_id).filter(Boolean)));
    const [{ data: pProds }, { data: profProds }, { data: studs2 }] = await Promise.all([
      partnerIds.length
        ? supabaseAdmin.from("partner_products").select("id, name").in("id", partnerIds)
        : Promise.resolve({ data: [] as any[] }),
      profIds.length
        ? supabaseAdmin.from("professional_products").select("id, name").in("id", profIds)
        : Promise.resolve({ data: [] as any[] }),
      studIds2.length
        ? supabaseAdmin
            .from("students")
            .select("id, profile_id, profiles!students_profile_id_fkey(full_name, email)")
            .in("id", studIds2)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameMap = new Map<string, string>();
    ((pProds as any[]) || []).forEach((p) => nameMap.set(p.id, p.name));
    ((profProds as any[]) || []).forEach((p) => nameMap.set(p.id, p.name));
    const studMap2 = new Map<string, { id: string; name: string; email: string | null }>();
    ((studs2 as any[]) || []).forEach((s) =>
      studMap2.set(s.id, { id: s.id, name: s.profiles?.full_name || "Aluno", email: s.profiles?.email || null }),
    );
    ((pp as any[]) || []).forEach((o) => {
      const isProfessional = !!o.professional_product_id || !!o.professional_coach_id;
      const prodId = o.partner_product_id || o.professional_product_id;
      results.push({
        id: o.id,
        source: isProfessional ? "professional" : "partner",
        order_number: o.order_number,
        status: o.status,
        created_at: o.created_at,
        paid_at: o.paid_at,
        delivery_started_at: o.delivery_started_at,
        delivery_days: o.delivery_days,
        product_name: (prodId && nameMap.get(prodId)) || `Pedido ${o.order_number}`,
        amount: Number(o.gross_amount || 0),
        student: studMap2.get(o.student_id) || null,
        shipping: {
          zip: o.shipping_zip,
          address: o.shipping_address,
          number: o.shipping_number,
          reference: o.shipping_reference,
          location_url: o.shipping_location_url,
        },
      });
    });

    return results.sort((a, b) => (b.paid_at || b.created_at).localeCompare(a.paid_at || a.created_at));
  });

export const markOrderDelivered = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["store_order", "partner_product_order"]), order_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");
    const isAdmin = (profile as any).role === "admin";
    if (!isAdmin) throw new Error("Somente administradores podem marcar como entregue por aqui.");
    const table = data.kind === "store_order" ? "store_orders" : "partner_product_orders";
    const { error } = await supabaseAdmin
      .from(table as any)
      .update({ status: "delivered" as any } as any)
      .eq("id", data.order_id);
    // Some tables don't have "delivered" — fall back silently
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
