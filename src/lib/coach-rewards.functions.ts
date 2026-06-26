import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RewardPlan = {
  id: string;
  name: string;
  description: string | null;
  planType: "period" | "monthly_challenge";
  durationMonths: number;
  rewardDescription: string | null;
  rewardDetails: string | null;
  rewardValue: number;
  rewardImageUrl: string | null;
  targetPoints: number;
  currentPoints: number;
  pctComplete: number;
  periodStartIso: string;
  periodEndIso: string;
  achieved: boolean;
};

export type RewardContribution = {
  id: string;
  createdAt: string;
  points: number;
  productName: string | null;
  studentName: string | null;
  grossAmount: number | null;
  reason: string | null;
};

async function resolveCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

function windowForPlan(planType: string, durationMonths: number): { start: Date; end: Date } {
  const now = new Date();
  if (planType === "monthly_challenge") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }
  const start = new Date(now);
  start.setMonth(start.getMonth() - (durationMonths || 1));
  return { start, end: now };
}

export const getCoachRewards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RewardPlan[]> => {
    const coachId = await resolveCoachId(context.userId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    const { data: plans } = await supabaseAdmin
      .from("career_plan_config")
      .select("id,name,description,plan_type,duration_months,min_monthly_points,required_period_points,reward_description,reward_details,reward_value,reward_image_url,is_active")
      .eq("is_active", true);
    const list = (plans as Array<{
      id: string; name: string; description: string | null;
      plan_type: string; duration_months: number;
      min_monthly_points: number; required_period_points: number;
      reward_description: string | null; reward_details: string | null;
      reward_value: number | null; reward_image_url: string | null;
    }> | null) || [];

    const results: RewardPlan[] = [];
    for (const p of list) {
      const target = p.plan_type === "monthly_challenge"
        ? Number(p.min_monthly_points) || 0
        : Number(p.required_period_points) || 0;
      const { start, end } = windowForPlan(p.plan_type, p.duration_months);
      const effectiveStartIso = cutoff && cutoff > start.toISOString() ? cutoff : start.toISOString();
      let current = 0;
      if (coachId) {
        const { data: pts } = await supabaseAdmin
          .from("coach_points_log")
          .select("points")
          .eq("coach_id", coachId)
          .gte("created_at", effectiveStartIso)
          .lt("created_at", end.toISOString());
        current = ((pts as { points: number }[] | null) || []).reduce((s, r) => s + (Number(r.points) || 0), 0);
      }
      results.push({
        id: p.id,
        name: p.name,
        description: p.description,
        planType: (p.plan_type as "period" | "monthly_challenge"),
        durationMonths: Number(p.duration_months) || 1,
        rewardDescription: p.reward_description,
        rewardDetails: p.reward_details,
        rewardValue: Number(p.reward_value) || 0,
        rewardImageUrl: p.reward_image_url,
        targetPoints: target,
        currentPoints: current,
        pctComplete: target > 0 ? Math.min(100, (current / target) * 100) : 0,
        periodStartIso: start.toISOString(),
        periodEndIso: end.toISOString(),
        achieved: target > 0 && current >= target,
      });
    }
    // Monthly first then period for visual ordering
    results.sort((a, b) => (a.planType === b.planType ? 0 : a.planType === "monthly_challenge" ? -1 : 1));
    return results;
  });

export const getRewardContributions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ planId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ plan: RewardPlan | null; contributions: RewardContribution[] }> => {
    const coachId = await resolveCoachId(context.userId);
    const { data: planRow } = await supabaseAdmin
      .from("career_plan_config")
      .select("id,name,description,plan_type,duration_months,min_monthly_points,required_period_points,reward_description,reward_details,reward_value,reward_image_url")
      .eq("id", data.planId).maybeSingle();
    if (!planRow) return { plan: null, contributions: [] };
    const p = planRow as {
      id: string; name: string; description: string | null;
      plan_type: string; duration_months: number;
      min_monthly_points: number; required_period_points: number;
      reward_description: string | null; reward_details: string | null;
      reward_value: number | null; reward_image_url: string | null;
    };
    const { start, end } = windowForPlan(p.plan_type, p.duration_months);
    const target = p.plan_type === "monthly_challenge"
      ? Number(p.min_monthly_points) || 0
      : Number(p.required_period_points) || 0;
    let contributions: RewardContribution[] = [];
    let current = 0;
    if (coachId) {
      const { data: logs } = await supabaseAdmin
        .from("coach_points_log")
        .select("id,created_at,points,reason,product_id,transaction_id")
        .eq("coach_id", coachId)
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);
      const rows = (logs as Array<{ id: string; created_at: string; points: number; reason: string | null; product_id: string | null; transaction_id: string | null }> | null) || [];
      current = rows.reduce((s, r) => s + (Number(r.points) || 0), 0);
      const productIds = Array.from(new Set(rows.map((r) => r.product_id).filter(Boolean) as string[]));
      const txIds = Array.from(new Set(rows.map((r) => r.transaction_id).filter(Boolean) as string[]));
      const productsMap = new Map<string, string>();
      if (productIds.length) {
        const { data: prods } = await supabaseAdmin.from("products").select("id,name").in("id", productIds);
        ((prods as { id: string; name: string }[] | null) || []).forEach((p2) => productsMap.set(p2.id, p2.name));
      }
      const txMap = new Map<string, { gross: number; studentId: string | null }>();
      if (txIds.length) {
        const { data: txs } = await supabaseAdmin.from("transactions").select("id,gross_amount,student_id").in("id", txIds);
        ((txs as { id: string; gross_amount: number; student_id: string | null }[] | null) || []).forEach((t) => txMap.set(t.id, { gross: Number(t.gross_amount) || 0, studentId: t.student_id }));
      }
      const studentIds = Array.from(new Set(Array.from(txMap.values()).map((v) => v.studentId).filter(Boolean) as string[]));
      const studentMap = new Map<string, string>();
      if (studentIds.length) {
        const { data: studs } = await supabaseAdmin.from("students").select("id, profile:profiles!students_profile_id_fkey(name)").in("id", studentIds);
        ((studs as Array<{ id: string; profile: { name: string | null } | null }> | null) || []).forEach((s) => studentMap.set(s.id, s.profile?.name || ""));
      }
      contributions = rows.map((r) => {
        const tx = r.transaction_id ? txMap.get(r.transaction_id) : null;
        return {
          id: r.id,
          createdAt: r.created_at,
          points: Number(r.points) || 0,
          productName: r.product_id ? productsMap.get(r.product_id) || null : null,
          studentName: tx?.studentId ? studentMap.get(tx.studentId) || null : null,
          grossAmount: tx ? tx.gross : null,
          reason: r.reason,
        };
      });
    }
    const plan: RewardPlan = {
      id: p.id, name: p.name, description: p.description,
      planType: p.plan_type as "period" | "monthly_challenge",
      durationMonths: Number(p.duration_months) || 1,
      rewardDescription: p.reward_description,
      rewardDetails: p.reward_details,
      rewardValue: Number(p.reward_value) || 0,
      rewardImageUrl: p.reward_image_url,
      targetPoints: target,
      currentPoints: current,
      pctComplete: target > 0 ? Math.min(100, (current / target) * 100) : 0,
      periodStartIso: start.toISOString(),
      periodEndIso: end.toISOString(),
      achieved: target > 0 && current >= target,
    };
    return { plan, contributions };
  });
