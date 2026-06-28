import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

export type OrderPoolStatus = "pending" | "preparing" | "shipped" | "delivered" | "cancelled";

export type OrderPoolEntry = {
  id: string;
  transaction_id: string | null;
  student_id: string | null;
  student_name: string | null;
  coach_id: string | null;
  coach_name: string | null;
  hbl_fulfiller_name: string | null;
  product_id: string | null;
  product_name: string | null;
  slot_label: string | null;
  amount: number;
  status: OrderPoolStatus;
  tracking_code: string | null;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
};

export const listOrderPoolEntries = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => (d as { status?: OrderPoolStatus | "all" }) || {})
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<OrderPoolEntry[]> => {
    await ensureAdmin(context.userId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    let q = supabaseAdmin
      .from("product_order_pool_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (cutoff) q = q.gte("created_at", cutoff);
    const { data: rows } = await q;
    if (!rows?.length) return [];

    const studentIds = Array.from(new Set(rows.map((r: any) => r.student_id).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean)));
    const transactionIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean))) as string[];

    const [{ data: students }, { data: products }, { data: partnerOrders }] = await Promise.all([
      studentIds.length
        ? supabaseAdmin
            .from("students")
            .select("id, profile_id, coach_id, profiles!inner(name)")
            .in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      transactionIds.length
        ? supabaseAdmin
            .from("partner_product_orders" as never)
            .select("id, selling_coach_id" as never)
            .in("id" as never, transactionIds as never)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const sNameMap = new Map<string, string>();
    const sCoachMap = new Map<string, string | null>();
    (students || []).forEach((s: any) => {
      sNameMap.set(s.id, s.profiles?.name || "");
      sCoachMap.set(s.id, s.coach_id || null);
    });
    const pMap = new Map<string, string>();
    (products || []).forEach((p: any) => pMap.set(p.id, p.name));

    // Authoritative seller-coach per transaction (preferred over student.coach_id when present)
    const txCoachMap = new Map<string, string>();
    ((partnerOrders as any[]) || []).forEach((o: any) => {
      if (o.id && o.selling_coach_id) txCoachMap.set(o.id, o.selling_coach_id);
    });

    // Resolve coach names — union of student.coach_id and partner_product_orders.selling_coach_id
    const coachIds = Array.from(new Set([
      ...Array.from(sCoachMap.values()).filter(Boolean),
      ...Array.from(txCoachMap.values()),
    ] as string[]));
    const cNameMap = new Map<string, { id: string; name: string }>();
    if (coachIds.length) {
      const { data: coaches } = await supabaseAdmin
        .from("coaches")
        .select("id, profile_id, fantasy_name, profiles(name)")
        .in("id", coachIds);
      (coaches || []).forEach((c: any) =>
        cNameMap.set(c.id, { id: c.id, name: c.fantasy_name || c.profiles?.name || "—" }),
      );
    }


    return rows.map((r: any) => {
      // Prefer the actual seller-coach from partner_product_orders (matches "vendido por"),
      // fall back to the student's titular coach.
      const coachId =
        (r.transaction_id ? txCoachMap.get(r.transaction_id) : null) ??
        (r.student_id ? sCoachMap.get(r.student_id) ?? null : null);
      return {
        id: r.id,
        transaction_id: r.transaction_id,
        student_id: r.student_id,
        student_name: r.student_id ? sNameMap.get(r.student_id) || null : null,
        coach_id: coachId,
        coach_name: coachId ? cNameMap.get(coachId)?.name ?? null : null,
        // Placeholder: coach HBL responsável pelo envio (badge 42% ou 50%)
        // será preenchido quando a funcionalidade de fulfillment HBL existir.
        hbl_fulfiller_name: null,
        product_id: r.product_id,
        product_name: r.product_id ? pMap.get(r.product_id) || null : null,
        slot_label: r.slot_label,
        amount: Number(r.amount || 0),
        status: r.status,
        tracking_code: r.tracking_code,
        notes: r.notes,
        created_at: r.created_at,
        shipped_at: r.shipped_at,
        delivered_at: r.delivered_at,
      };
    });
  });

// Atualiza o status de TODOS os entries vinculados à mesma venda (transação)
// — produtos de uma mesma venda são enviados juntos.
export const updateTransactionOrderStatus = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as { transactionId: string; status: OrderPoolStatus; tracking?: string; notes?: string },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { data: entries, error: selErr } = await supabaseAdmin
      .from("product_order_pool_entries")
      .select("id")
      .eq("transaction_id", data.transactionId);
    if (selErr) throw new Error(selErr.message);
    for (const e of entries || []) {
      const { error } = await context.supabase.rpc("mark_order_pool_entry_status", {
        _entry_id: (e as any).id,
        _status: data.status,
        _tracking: data.tracking ?? undefined,
        _notes: data.notes ?? undefined,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: (entries || []).length };
  });

export const updateOrderPoolEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as { entryId: string; status: OrderPoolStatus; tracking?: string; notes?: string },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await context.supabase.rpc("mark_order_pool_entry_status", {
      _entry_id: data.entryId,
      _status: data.status,
      _tracking: data.tracking ?? undefined,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createOrderPoolEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as {
        studentId?: string | null;
        productId?: string | null;
        slotLabel: string;
        amount: number;
        notes?: string;
      },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.from("product_order_pool_entries").insert({
      student_id: data.studentId || null,
      product_id: data.productId || null,
      slot_label: data.slotLabel,
      amount: data.amount,
      notes: data.notes || null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
