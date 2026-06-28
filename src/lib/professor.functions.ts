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

export type ProfessorWalletRow = {
  profile_id: string;
  name: string;
  email: string | null;
  available_balance: number;
  blocked_balance: number;
  total_earned: number;
  total_released: number;
  total_withdrawn: number;
};

export type ProfessorBlockedEntry = {
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
  source: "professor" | "admin_system";
  transaction_id: string | null;
};

export const listProfessorWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProfessorWalletRow[]> => {
    await ensureAdmin(context.userId);
    const { data: wallets } = await (supabaseAdmin as any)
      .from("professor_wallets")
      .select("*");
    const rowsRaw = (wallets as any[]) || [];
    const ids = rowsRaw.map((w) => w.profile_id);
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", ids)
      : { data: [] as any[] };
    const pMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => pMap.set(p.id, p));

    // Carteira virtual: valores marcados como professor ainda não atribuídos
    const { data: adminEntries } = await supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("slot_label, kind, amount")
      .ilike("slot_label", "%professor%");
    let nCredits = 0;
    let nDebits = 0;
    (adminEntries || []).forEach((e: any) => {
      const amt = Number(e.amount || 0);
      if (e.kind === "debit") nDebits += amt;
      else nCredits += amt;
    });
    const unassigned: ProfessorWalletRow = {
      profile_id: "admin-professor",
      name: "Admin Professor (não atribuído)",
      email: null,
      available_balance: Math.max(0, nCredits - nDebits),
      blocked_balance: 0,
      total_earned: nCredits,
      total_released: nCredits,
      total_withdrawn: nDebits,
    };

    const rows = rowsRaw.map((w) => ({
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

export const listProfessorBlockedEntries = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => (d as { status?: "blocked" | "released" | "cancelled" | "all" }) || {})
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ProfessorBlockedEntry[]> => {
    await ensureAdmin(context.userId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    let q = (supabaseAdmin as any)
      .from("professor_blocked_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (cutoff) q = q.gte("created_at", cutoff);
    const { data: rows } = await q;

    let virtualRows: any[] = [];
    if (!data.status || data.status === "blocked" || data.status === "all") {
      const { data: sysRowsRaw } = await (cutoff
        ? supabaseAdmin
            .from("admin_system_wallet_entries")
            .select("id,transaction_id,slot_label,amount,kind,notes,created_at")
            .ilike("slot_label", "%professor%")
            .gte("created_at", cutoff)
            .order("created_at", { ascending: false })
            .limit(500)
        : supabaseAdmin
            .from("admin_system_wallet_entries")
            .select("id,transaction_id,slot_label,amount,kind,notes,created_at")
            .ilike("slot_label", "%professor%")
            .order("created_at", { ascending: false })
            .limit(500));
      const sysRows = (sysRowsRaw as any[]) || [];
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

    const allRows = [
      ...((rows as any[]) || []),
      ...virtualRows.map((v) => ({
        id: `sys-${v.id}`,
        profile_id: "admin-professor",
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
      })),
    ];

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

    const profileIds = Array.from(new Set(allRows.map((r: any) => r.profile_id).filter((id) => id && id !== "admin-professor")));
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
        profile_name: r.profile_id === "admin-professor"
          ? "Admin Professor (não atribuído)"
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
        source: r.__virtual ? "admin_system" : "professor",
        transaction_id: r.__virtual ? r.__transaction_id : null,
      };
    });
  });

export const releaseProfessorEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { entryId: string; notes?: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await context.supabase.rpc("release_professor_blocked_entry" as any, {
      _entry_id: data.entryId,
      _notes: data.notes ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelProfessorEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { entryId: string; notes?: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    const { error } = await context.supabase.rpc("cancel_professor_blocked_entry" as any, {
      _entry_id: data.entryId,
      _notes: data.notes ?? undefined,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignProfessorToSystemEntry = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { systemEntryId: string; profileId: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    if (!data.systemEntryId || !data.profileId) throw new Error("Dados inválidos");

    const { data: sysRow } = await supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("id,transaction_id,slot_label,amount,kind")
      .eq("id", data.systemEntryId)
      .maybeSingle();
    if (!sysRow) throw new Error("Lançamento não encontrado");
    if ((sysRow as any).kind !== "credit") throw new Error("Lançamento já atribuído");

    const amount = Number((sysRow as any).amount || 0);
    const txId = (sysRow as any).transaction_id as string | null;

    let studentId: string | null = null;
    let productId: string | null = null;
    if (txId) {
      const { data: tx } = await supabaseAdmin
        .from("transactions")
        .select("student_id,product_id")
        .eq("id", txId)
        .maybeSingle();
      studentId = (tx as any)?.student_id ?? null;
      productId = (tx as any)?.product_id ?? null;
    }

    // 1) Inserir lançamento bloqueado para o professor
    const { error: insErr } = await (supabaseAdmin as any).from("professor_blocked_entries").insert({
      transaction_id: txId,
      profile_id: data.profileId,
      amount,
      slot_label: (sysRow as any).slot_label || "professor",
      reason: "Atribuição manual de venda",
      student_id: studentId,
      product_id: productId,
    });
    if (insErr) throw new Error(insErr.message);

    // 2) Atualizar carteira do professor
    const { data: existing } = await (supabaseAdmin as any)
      .from("professor_wallets")
      .select("blocked_balance,total_earned")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    if (existing) {
      await (supabaseAdmin as any)
        .from("professor_wallets")
        .update({
          blocked_balance: Number((existing as any).blocked_balance || 0) + amount,
          total_earned: Number((existing as any).total_earned || 0) + amount,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", data.profileId);
    } else {
      await (supabaseAdmin as any).from("professor_wallets").insert({
        profile_id: data.profileId,
        blocked_balance: amount,
        total_earned: amount,
      });
    }

    // 3) Débito no admin para zerar a parte virtual
    await supabaseAdmin.from("admin_system_wallet_entries").insert({
      transaction_id: txId,
      slot_label: (sysRow as any).slot_label || "professor",
      amount,
      kind: "debit",
      notes: `Atribuído ao professor (profile_id=${data.profileId})`,
    } as never);

    return { ok: true };
  });
