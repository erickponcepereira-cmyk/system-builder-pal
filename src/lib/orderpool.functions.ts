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
    let q = supabaseAdmin
      .from("product_order_pool_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    if (!rows?.length) return [];

    const studentIds = Array.from(new Set(rows.map((r: any) => r.student_id).filter(Boolean)));
    const productIds = Array.from(new Set(rows.map((r: any) => r.product_id).filter(Boolean)));

    const [{ data: students }, { data: products }] = await Promise.all([
      studentIds.length
        ? supabaseAdmin
            .from("students")
            .select("id, profile_id, profiles!inner(name)")
            .in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const sMap = new Map<string, string>();
    (students || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
    const pMap = new Map<string, string>();
    (products || []).forEach((p: any) => pMap.set(p.id, p.name));

    return rows.map((r: any) => ({
      id: r.id,
      transaction_id: r.transaction_id,
      student_id: r.student_id,
      student_name: r.student_id ? sMap.get(r.student_id) || null : null,
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
    }));
  });

export const updateOrderPoolEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as { entryId: string; status: OrderPoolStatus; tracking?: string; notes?: string },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("mark_order_pool_entry_status", {
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
