import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AchievementMember = {
  coachId: string;
  profileId: string;
  name: string;
  sponsorName: string | null;
  isMe: boolean;
};

export type AchievementKind = "patent" | "medal_monthly" | "medal_cumulative";

export type AchievementMembersInput = {
  kind: AchievementKind;
  key: string;
};

async function resolveMyCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

export const getAchievementMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AchievementMembersInput) => {
    if (!input || typeof input.key !== "string" || !input.key) {
      throw new Error("Chave da conquista inválida");
    }
    if (!["patent", "medal_monthly", "medal_cumulative"].includes(input.kind)) {
      throw new Error("Tipo de conquista inválido");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<AchievementMember[]> => {
    const myCoachId = await resolveMyCoachId(context.userId);

    // Determine the set of coach IDs whose "current/top" achievement matches `key`.
    let memberCoachIds = new Set<string>();

    if (data.kind === "patent") {
      const { data: patentRules } = await supabaseAdmin
        .from("patent_rules")
        .select("key,level")
        .eq("is_active", true);
      const rules = (patentRules as { key: string; level: number }[] | null) || [];
      const target = rules.find((r) => r.key === data.key);
      if (!target) return [];
      const levelByKey = new Map(rules.map((r) => [r.key, Number(r.level) || 0]));

      const { data: ach } = await supabaseAdmin
        .from("coach_patent_achievements" as never)
        .select("coach_id,patent_key");
      const topByCoach = new Map<string, { key: string; level: number }>();
      ((ach as { coach_id: string; patent_key: string }[] | null) || []).forEach((a) => {
        const lvl = levelByKey.get(a.patent_key) ?? 0;
        const cur = topByCoach.get(a.coach_id);
        if (!cur || lvl > cur.level) topByCoach.set(a.coach_id, { key: a.patent_key, level: lvl });
      });
      topByCoach.forEach((v, coachId) => {
        if (v.key === data.key) memberCoachIds.add(coachId);
      });
    } else {
      const kindCol = data.kind === "medal_monthly" ? "monthly" : "cumulative";
      const { data: rulesRaw } = await supabaseAdmin
        .from("career_medal_rules" as never)
        .select("key,threshold,kind")
        .eq("is_active", true)
        .eq("kind", kindCol);
      const rules = (rulesRaw as { key: string; threshold: number }[] | null) || [];
      const target = rules.find((r) => r.key === data.key);
      if (!target) return [];
      const thresholdByKey = new Map(rules.map((r) => [r.key, Number(r.threshold) || 0]));

      let q = supabaseAdmin
        .from("coach_medals_individual" as never)
        .select("coach_id,medal_key,period_year,period_month")
        .eq("medal_kind", kindCol);

      if (data.kind === "medal_monthly") {
        const now = new Date();
        q = q.eq("period_year", now.getUTCFullYear()).eq("period_month", now.getUTCMonth() + 1);
      }
      const { data: earned } = await q;
      const topByCoach = new Map<string, { key: string; threshold: number }>();
      ((earned as { coach_id: string; medal_key: string }[] | null) || []).forEach((e) => {
        const th = thresholdByKey.get(e.medal_key) ?? 0;
        const cur = topByCoach.get(e.coach_id);
        if (!cur || th > cur.threshold) topByCoach.set(e.coach_id, { key: e.medal_key, threshold: th });
      });
      topByCoach.forEach((v, coachId) => {
        if (v.key === data.key) memberCoachIds.add(coachId);
      });
    }

    if (memberCoachIds.size === 0) return [];

    const coachIds = Array.from(memberCoachIds);
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id,profile_id,upline_coach_id")
      .in("id", coachIds);
    const coachRows = (coaches as { id: string; profile_id: string; upline_coach_id: string | null }[] | null) || [];

    // Collect upline coach IDs to fetch sponsor names
    const uplineIds = Array.from(new Set(coachRows.map((c) => c.upline_coach_id).filter(Boolean) as string[]));
    const { data: uplines } = uplineIds.length
      ? await supabaseAdmin.from("coaches").select("id,profile_id").in("id", uplineIds)
      : { data: [] as { id: string; profile_id: string }[] };
    const uplineProfileByCoach = new Map<string, string>();
    ((uplines as { id: string; profile_id: string }[] | null) || []).forEach((u) => {
      uplineProfileByCoach.set(u.id, u.profile_id);
    });

    const allProfileIds = Array.from(
      new Set<string>([
        ...coachRows.map((c) => c.profile_id),
        ...Array.from(uplineProfileByCoach.values()),
      ]),
    );
    const { data: profiles } = allProfileIds.length
      ? await supabaseAdmin.from("profiles").select("id,full_name").in("id", allProfileIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameByProfile = new Map<string, string>();
    ((profiles as { id: string; full_name: string | null }[] | null) || []).forEach((p) => {
      nameByProfile.set(p.id, p.full_name || "Sem nome");
    });

    const members: AchievementMember[] = coachRows.map((c) => {
      const sponsorProfileId = c.upline_coach_id ? uplineProfileByCoach.get(c.upline_coach_id) : undefined;
      return {
        coachId: c.id,
        profileId: c.profile_id,
        name: nameByProfile.get(c.profile_id) || "Sem nome",
        sponsorName: sponsorProfileId ? (nameByProfile.get(sponsorProfileId) || null) : null,
        isMe: c.id === myCoachId,
      };
    });

    members.sort((a, b) => {
      if (a.isMe && !b.isMe) return -1;
      if (!a.isMe && b.isMe) return 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });

    return members;
  });
