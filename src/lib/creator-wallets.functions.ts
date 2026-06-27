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
  if (!data || (data as any).role !== "admin") throw new Error("Acesso negado");
}

export type CreatorWalletRow = {
  id: string; // wallet owner id (partner.id or coach.id)
  profile_id: string | null;
  name: string;
  email: string | null;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
};

export const listPartnerCreatorWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorWalletRow[]> => {
    await ensureAdmin(context.userId);
    const { data: wallets } = await (supabaseAdmin as any)
      .from("partner_wallets")
      .select("*");
    const rows = (wallets as any[]) || [];
    if (!rows.length) return [];
    const partnerIds = rows.map((r) => r.partner_id);
    const { data: partners } = await supabaseAdmin
      .from("partners")
      .select("id, profile_id")
      .in("id", partnerIds);
    const profileIds = ((partners as any[]) || []).map((p) => p.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds)
      : { data: [] as any[] };
    const partnerMap = new Map<string, string | null>();
    ((partners as any[]) || []).forEach((p) => partnerMap.set(p.id, p.profile_id || null));
    const profMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profMap.set(p.id, p));
    return rows.map((w) => {
      const pid = partnerMap.get(w.partner_id) || null;
      const prof = pid ? profMap.get(pid) : null;
      return {
        id: w.partner_id,
        profile_id: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        available_balance: Number(w.available_balance || 0),
        pending_balance: Number(w.pending_balance || 0),
        total_earned: Number(w.total_earned || 0),
        total_withdrawn: Number(w.total_withdrawn || 0),
      };
    });
  });

export const listProfessionalCreatorWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorWalletRow[]> => {
    await ensureAdmin(context.userId);
    const { data: wallets } = await (supabaseAdmin as any)
      .from("professional_wallets")
      .select("*");
    const rows = (wallets as any[]) || [];
    if (!rows.length) return [];
    const coachIds = rows.map((r) => r.professional_coach_id);
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .in("id", coachIds);
    const profileIds = ((coaches as any[]) || []).map((c) => c.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds)
      : { data: [] as any[] };
    const coachMap = new Map<string, string | null>();
    ((coaches as any[]) || []).forEach((c) => coachMap.set(c.id, c.profile_id || null));
    const profMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profMap.set(p.id, p));
    return rows.map((w) => {
      const pid = coachMap.get(w.professional_coach_id) || null;
      const prof = pid ? profMap.get(pid) : null;
      return {
        id: w.professional_coach_id,
        profile_id: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        available_balance: Number(w.available_balance || 0),
        pending_balance: Number(w.pending_balance || 0),
        total_earned: Number(w.total_earned || 0),
        total_withdrawn: Number(w.total_withdrawn || 0),
      };
    });
  });
