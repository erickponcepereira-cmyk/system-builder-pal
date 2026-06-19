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

export type NutritionistWalletRow = {
  profile_id: string;
  name: string;
  email: string | null;
  available_balance: number;
  blocked_balance: number;
  total_earned: number;
  total_released: number;
  total_withdrawn: number;
};

export type NutriBlockedEntry = {
  id: string;
  profile_id: string;
  profile_name: string;
  student_id: string | null;
  student_name: string | null;
  coach_name: string | null;
  product_id: string | null;
  product_name: string | null;
  slot_label: string | null;
  amount: number;
  status: "blocked" | "released" | "cancelled";
  reason: string | null;
  notes: string | null;
  created_at: string;
  released_at: string | null;
  /** Virtual entries originadas de admin_system_wallet_entries (não atribuídas) */
  source: "nutritionist" | "admin_system";
  transaction_id: string | null;
};

export const listNutritionistWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<NutritionistWalletRow[]> => {
    await ensureAdmin(context.userId);
    const { data: wallets } = await supabaseAdmin
      .from("nutritionist_wallets")
      .select("*");
    const ids = (wallets || []).map((w: any) => w.profile_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", ids)
      : { data: [] as any[] };
    const pMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => pMap.set(p.id, p));

    // Carteira virtual: valores de nutricionista ainda não atribuídos
    // (vivem em admin_system_wallet_entries com slot "nutricionista")
    const { data: adminEntries } = await supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("slot_label, kind, amount")
      .ilike("slot_label", "%nutricion%");
    let nCredits = 0;
    let nDebits = 0;
    (adminEntries || []).forEach((e: any) => {
      const amt = Number(e.amount || 0);
      if (e.kind === "debit") nDebits += amt;
      else nCredits += amt;
    });
    const unassigned: NutritionistWalletRow = {
      profile_id: "admin-nutricionista",
      name: "Admin Nutricionista (não atribuído)",
      email: null,
      available_balance: Math.max(0, nCredits - nDebits),
      blocked_balance: 0,
      total_earned: nCredits,
      total_released: nCredits,
      total_withdrawn: nDebits,
    };

    const rows = (wallets || []).map((w: any) => ({
      profile_id: w.profile_id,
      name: pMap.get(w.profile_id)?.name || "—",
      email: pMap.get(w.profile_id)?.email || null,
      available_balance: Number(w.available_balance || 0),
      blocked_balance: Number(w.blocked_balance || 0),
      total_earned: Number(w.total_earned || 0),
      total_released: Number(w.total_released || 0),
      total_withdrawn: Number(w.total_withdrawn || 0),
    }));
    return [unassigned, ...rows];
  });

export const listNutritionistBlockedEntries = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => (d as { status?: "blocked" | "released" | "cancelled" | "all" }) || {})
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<NutriBlockedEntry[]> => {
    await ensureAdmin(context.userId);
    let q = supabaseAdmin
      .from("nutritionist_blocked_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;

    // Carregar entradas virtuais (admin_system_wallet_entries com slot %nutricion%)
    // Apenas relevante quando filtro = blocked ou all (são consideradas "bloqueadas" até atribuição).
    let virtualRows: any[] = [];
    if (!data.status || data.status === "blocked" || data.status === "all") {
      const { data: sysRowsRaw } = await supabaseAdmin
        .from("admin_system_wallet_entries")
        .select("id,transaction_id,slot_label,amount,kind,notes,created_at")
        .ilike("slot_label", "%nutricion%")
        .order("created_at", { ascending: false })
        .limit(500);
      const sysRows = (sysRowsRaw as any[]) || [];
      // remover créditos que já têm débito (assigned) — match por transaction_id + amount
      const debits = new Map<string, number>();
      for (const r of sysRows) {
        if (r.kind === "debit") {
          const key = `${r.transaction_id || ""}-${Number(r.amount).toFixed(2)}`;
          debits.set(key, (debits.get(key) || 0) + 1);
        }
      }
      virtualRows = sysRows.filter((r) => {
        if (r.kind !== "credit") return false;
        const key = `${r.transaction_id || ""}-${Number(r.amount).toFixed(2)}`;
        const c = debits.get(key) || 0;
        if (c > 0) { debits.set(key, c - 1); return false; }
        return true;
      });
    }

    const allRows = [...(rows || []), ...virtualRows.map((v) => ({
      id: `sys-${v.id}`,
      profile_id: "admin-nutricionista",
      student_id: null as string | null,
      product_id: null as string | null,
      slot_label: v.slot_label,
      amount: v.amount,
      status: "blocked",
      reason: null,
      notes: v.notes,
      created_at: v.created_at,
      released_at: null,
      __virtual: true,
      __transaction_id: v.transaction_id as string | null,
      __system_entry_id: v.id as string,
    }))];

    // Para entradas virtuais, buscar student_id/product_id da transaction
    const txIds = Array.from(new Set(virtualRows.map((v) => v.transaction_id).filter(Boolean))) as string[];
    const txMap = new Map<string, { student_id: string | null; product_id: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id,student_id,product_id")
        .in("id", txIds);
      for (const t of ((txs as any[]) || [])) txMap.set(t.id, { student_id: t.student_id, product_id: t.product_id });
    }
    for (const r of allRows as any[]) {
      if (r.__virtual && r.__transaction_id) {
        const t = txMap.get(r.__transaction_id);
        if (t) { r.student_id = t.student_id; r.product_id = t.product_id; }
      }
    }

    if (!allRows.length) return [];

    const profileIds = Array.from(new Set(allRows.map((r: any) => r.profile_id).filter((id) => id && id !== "admin-nutricionista")));
    const studentIds = Array.from(new Set(allRows.map((r: any) => r.student_id).filter(Boolean)));
    const productIds = Array.from(new Set(allRows.map((r: any) => r.product_id).filter(Boolean)));

    const [{ data: profiles }, { data: students }, { data: products }] = await Promise.all([
      profileIds.length
        ? supabaseAdmin.from("profiles").select("id,name").in("id", profileIds)
        : Promise.resolve({ data: [] as any[] }),
      studentIds.length
        ? supabaseAdmin
            .from("students")
            .select("id,profile_id,coach_id,profiles!inner(name)")
            .in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id,name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const pmap = new Map<string, string>();
    (profiles || []).forEach((p: any) => pmap.set(p.id, p.name));
    const smap = new Map<string, { name: string; coach_id: string | null }>();
    (students || []).forEach((s: any) => smap.set(s.id, { name: s.profiles?.name || "", coach_id: s.coach_id || null }));
    const prmap = new Map<string, string>();
    (products || []).forEach((p: any) => prmap.set(p.id, p.name));

    // Coach name via coach_id -> coaches.profile_id -> profiles.name
    const coachIds = Array.from(new Set(Array.from(smap.values()).map((s) => s.coach_id).filter(Boolean))) as string[];
    const coachNameById = new Map<string, string>();
    if (coachIds.length) {
      const { data: coachRows } = await supabaseAdmin
        .from("coaches")
        .select("id,profile_id,profiles!coaches_profile_id_fkey(name)")
        .in("id", coachIds);
      for (const c of ((coachRows as any[]) || [])) coachNameById.set(c.id, c.profiles?.name || "");
    }

    return allRows.map((r: any) => {
      const stu = r.student_id ? smap.get(r.student_id) : null;
      return {
        id: r.id,
        profile_id: r.profile_id,
        profile_name: r.profile_id === "admin-nutricionista"
          ? "Admin Nutricionista (não atribuído)"
          : (pmap.get(r.profile_id) || "—"),
        student_id: r.student_id,
        student_name: stu?.name || null,
        coach_name: stu?.coach_id ? (coachNameById.get(stu.coach_id) || null) : null,
        product_id: r.product_id,
        product_name: r.product_id ? prmap.get(r.product_id) || null : null,
        slot_label: r.slot_label,
        amount: Number(r.amount || 0),
        status: r.status,
        reason: r.reason,
        notes: r.notes,
        created_at: r.created_at,
        released_at: r.released_at,
        source: r.__virtual ? "admin_system" : "nutritionist",
        transaction_id: r.__virtual ? r.__transaction_id : null,
      };
    });
  });


export const releaseNutritionistEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { entryId: string; notes?: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await context.supabase.rpc("release_nutritionist_blocked_entry", {
      _entry_id: data.entryId,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelNutritionistEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { entryId: string; notes?: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await context.supabase.rpc("cancel_nutritionist_blocked_entry", {
      _entry_id: data.entryId,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createNutritionistEntry = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as {
        profileId: string;
        amount: number;
        slotLabel: string;
        reason?: string;
        studentId?: string | null;
        productId?: string | null;
      },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await supabaseAdmin.from("nutritionist_blocked_entries").insert({
      profile_id: data.profileId,
      amount: data.amount,
      slot_label: data.slotLabel,
      reason: data.reason || null,
      student_id: data.studentId || null,
      product_id: data.productId || null,
    } as never);
    if (error) throw new Error(error.message);

    // Bump blocked_balance + total_earned
    const { data: existing } = await supabaseAdmin
      .from("nutritionist_wallets")
      .select("*")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("nutritionist_wallets")
        .update({
          blocked_balance: Number(existing.blocked_balance || 0) + data.amount,
          total_earned: Number(existing.total_earned || 0) + data.amount,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("profile_id", data.profileId);
    } else {
      await supabaseAdmin.from("nutritionist_wallets").insert({
        profile_id: data.profileId,
        blocked_balance: data.amount,
        total_earned: data.amount,
      } as never);
    }
    return { ok: true };
  });
