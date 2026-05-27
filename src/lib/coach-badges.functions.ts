import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export const BADGE_KEYS = [
  "master_coach",
  "coach_hbl_42",
  "coach_hbl_50",
  "nutritionist_partner",
  "council",
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.role !== "admin") throw new Error("Apenas administradores");
  return data.id as string;
}

export const listCoachesWithBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, profiles!coaches_profile_id_fkey(name, email)")
      .order("created_at", { ascending: false })
      .limit(500);
    const { data: badges } = await supabaseAdmin
      .from("coach_badges")
      .select("coach_id, badge_key, granted_at");
    const byCoach: Record<string, { badge_key: string; granted_at: string }[]> = {};
    (badges ?? []).forEach((b) => {
      (byCoach[b.coach_id] ??= []).push({ badge_key: b.badge_key, granted_at: b.granted_at });
    });
    return (coaches ?? []).map((c: any) => ({
      id: c.id,
      name: c.profiles?.name ?? "—",
      email: c.profiles?.email ?? "",
      badges: byCoach[c.id] ?? [],
    }));
  });

export const assignBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coachId: string; badge: BadgeKey; notes?: string }) =>
    z
      .object({
        coachId: z.string().uuid(),
        badge: z.enum(BADGE_KEYS),
        notes: z.string().max(500).optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const adminProfileId = await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("coach_badges").upsert(
      {
        coach_id: data.coachId,
        badge_key: data.badge,
        granted_by: adminProfileId,
        notes: data.notes ?? null,
      },
      { onConflict: "coach_id,badge_key" }
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { coachId: string; badge: BadgeKey }) =>
    z.object({ coachId: z.string().uuid(), badge: z.enum(BADGE_KEYS) }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("coach_badges")
      .delete()
      .eq("coach_id", data.coachId)
      .eq("badge_key", data.badge);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Used by the store to filter products the current coach can sell
export const getMyBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) return [];
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach?.id) return [];
    const { data: badges } = await supabaseAdmin
      .from("coach_badges")
      .select("badge_key")
      .eq("coach_id", coach.id);
    return (badges ?? []).map((b) => b.badge_key as BadgeKey);
  });

// ─── Product badge restrictions (admin) ──────────────────────────────
export const getProductBadgeFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string }) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: p } = await supabaseAdmin
      .from("products")
      .select("required_badge, allow_master_coach_sale, free_for_council, free_for_nutritionist")
      .eq("id", data.productId)
      .maybeSingle();
    return (
      p ?? {
        required_badge: null,
        allow_master_coach_sale: false,
        free_for_council: false,
        free_for_nutritionist: false,
      }
    );
  });

export const saveProductBadgeFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    productId: string;
    required_badge: BadgeKey | null;
    allow_master_coach_sale: boolean;
    free_for_council: boolean;
    free_for_nutritionist: boolean;
  }) =>
    z
      .object({
        productId: z.string().uuid(),
        required_badge: z.enum(BADGE_KEYS).nullable(),
        allow_master_coach_sale: z.boolean(),
        free_for_council: z.boolean(),
        free_for_nutritionist: z.boolean(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("products")
      .update({
        required_badge: data.required_badge,
        allow_master_coach_sale: data.allow_master_coach_sale,
        free_for_council: data.free_for_council,
        free_for_nutritionist: data.free_for_nutritionist,
      })
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Used by the coach Loja/FitMindShape to know if the current coach pays
export const getMyFitMindShapeAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) return { bypass: false, reason: null as null | "council" | "nutritionist_partner" };
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach?.id) return { bypass: false, reason: null };
    const { data: badges } = await supabaseAdmin
      .from("coach_badges")
      .select("badge_key")
      .eq("coach_id", coach.id)
      .in("badge_key", ["council", "nutritionist_partner"]);
    if (!badges || badges.length === 0) return { bypass: false, reason: null };
    const hasCouncil = badges.some((b) => b.badge_key === "council");
    return {
      bypass: true,
      reason: (hasCouncil ? "council" : "nutritionist_partner") as "council" | "nutritionist_partner",
    };
  });
