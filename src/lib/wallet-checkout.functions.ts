import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyWalletTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const profileId = prof?.id;
    if (!profileId) return { coach: 0, partner: 0, professional: 0, total: 0 };
    const [cw, pRow, cRow] = await Promise.all([
      supabase.from("wallets").select("available_balance").eq("profile_id", profileId).maybeSingle(),
      supabase.from("partners").select("id").eq("profile_id", profileId).maybeSingle(),
      supabase.from("coaches").select("id").eq("profile_id", profileId).maybeSingle(),
    ]);
    let partner = 0, professional = 0;
    if (pRow.data?.id) {
      const { data } = await supabase.from("partner_wallets").select("available_balance").eq("partner_id", pRow.data.id).maybeSingle();
      partner = Number(data?.available_balance || 0);
    }
    if (cRow.data?.id) {
      const { data } = await supabase.from("professional_wallets").select("available_balance").eq("professional_coach_id", cRow.data.id).maybeSingle();
      professional = Number(data?.available_balance || 0);
    }
    const coach = Number(cw.data?.available_balance || 0);
    return { coach, partner, professional, total: coach + partner + professional };
  });

export const payStoreOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pay_store_order_with_wallet", { _order_id: data.order_id });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; breakdown: Record<string, number> };
  });

export const payPartnerOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pay_partner_order_with_wallet", { _order_id: data.order_id });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; breakdown: Record<string, number> };
  });
