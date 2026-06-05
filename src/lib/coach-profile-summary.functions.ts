import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CurrentBadge = {
  key: string;
  name: string;
  image_url: string | null;
  icon: string | null;
  color: string | null;
  level?: number;
};

export type EnabledCategory = { key: string; label: string };

export type ActivityItemRow = { id: string; title: string; subtitle: string | null; date: string | null };

export type CoachProfileSummary = {
  coachId: string | null;
  totalActiveStudents: number;
  totalSales: number;
  studentsBrought: ActivityItemRow[];
  studentsWinners: ActivityItemRow[];
  coachesTrained: ActivityItemRow[];
  eventsMinistered: ActivityItemRow[];
  classesMinistered: ActivityItemRow[];
  currentPatent: CurrentBadge | null;
  currentMedal: CurrentBadge | null;
  enabledCategories: EnabledCategory[];
};

async function resolveCoachId(userId: string): Promise<{ profileId: string | null; coachId: string | null }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const profileId = (profile as { id: string } | null)?.id ?? null;
  if (!profileId) return { profileId: null, coachId: null };
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profileId).maybeSingle();
  return { profileId, coachId: (coach as { id: string } | null)?.id ?? null };
}

const BADGE_LABELS: Record<string, string> = {
  master_coach: "Master Coach",
  council: "Conselho",
  coach_hbl_42: "Coach HBL 42",
  nutritionist_partner: "Nutricionista parceiro",
  partnership_master: "Parcerias Master",
  event_creator: "Criador de eventos",
};

export const getCoachProfileSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachProfileSummary> => {
    const { profileId, coachId } = await resolveCoachId(context.userId);
    const empty: CoachProfileSummary = {
      coachId: null, totalActiveStudents: 0, totalSales: 0,
      studentsBrought: [], studentsWinners: [], coachesTrained: [],
      eventsMinistered: [], classesMinistered: [],
      currentPatent: null, currentMedal: null, enabledCategories: [],
    };
    if (!coachId || !profileId) return empty;

    // Real sales total (paid transactions of own students)
    const { data: studs } = await supabaseAdmin
      .from("students").select("id,profile_id,coach_id,created_at")
      .eq("coach_id", coachId);
    const ownStudents = ((studs || []) as unknown) as Array<{ id: string; profile_id: string; coach_id: string; created_at: string }>;
    const studentIds = ownStudents.map((s) => s.id);
    const studentProfileIds = ownStudents.map((s) => s.profile_id).filter(Boolean) as string[];

    let totalSales = 0;
    if (studentIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions").select("gross_amount").in("student_id", studentIds).eq("status", "paid");
      ((txs || []) as Array<{ gross_amount: number }>).forEach((t) => { totalSales += Number(t.gross_amount) || 0; });
      const { data: orders } = await supabaseAdmin
        .from("store_orders").select("total_amount").in("student_id", studentIds).eq("status", "paid");
      ((orders || []) as Array<{ total_amount: number }>).forEach((o) => { totalSales += Number(o.total_amount) || 0; });
    }
    const totalActiveStudents = ownStudents.length;

    // Resolve names for own students
    const nameByProfile = new Map<string, string>();
    if (studentProfileIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id,name").in("id", studentProfileIds);
      ((profs || []) as Array<{ id: string; name: string | null }>).forEach((p) => {
        nameByProfile.set(p.id, p.name || "Aluno");
      });
    }
    const studentsBrought: ActivityItemRow[] = ownStudents
      .map((s) => ({ id: s.id, title: nameByProfile.get(s.profile_id) || "Aluno", subtitle: null, date: s.created_at }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Winners among own students
    let studentsWinners: ActivityItemRow[] = [];
    if (studentIds.length) {
      const { data: wins } = await supabaseAdmin
        .from("challenge_winners")
        .select("id,student_id,placement,created_at,edition_id,challenge_editions(edition_name,edition_number)")
        .in("student_id", studentIds);
      const studentNameById = new Map<string, string>();
      ownStudents.forEach((s) => studentNameById.set(s.id, nameByProfile.get(s.profile_id) || "Aluno"));
      studentsWinners = (((wins || []) as unknown) as Array<{ id: string; student_id: string; placement: number; created_at: string; challenge_editions: { edition_name: string | null; edition_number: number | null } | null }>)
        .map((w) => ({
          id: w.id,
          title: studentNameById.get(w.student_id) || "Aluno",
          subtitle: `${w.placement || 0}º · ${w.challenge_editions?.edition_name || `Edição ${w.challenge_editions?.edition_number ?? ""}`}`.trim(),
          date: w.created_at,
        }))
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    }

    // Coaches trained = direct downline coaches
    const { data: down } = await supabaseAdmin
      .from("coaches").select("id,profile_id,created_at").eq("upline_coach_id", coachId);
    const downRows = (down || []) as Array<{ id: string; profile_id: string; created_at: string }>;
    const downProfIds = downRows.map((c) => c.profile_id);
    const downNames = new Map<string, string>();
    if (downProfIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id,name").in("id", downProfIds);
      ((profs || []) as Array<{ id: string; name: string | null }>).forEach((p) => {
        downNames.set(p.id, p.name || "Coach");
      });
    }
    const coachesTrained: ActivityItemRow[] = downRows
      .map((c) => ({ id: c.id, title: downNames.get(c.profile_id) || "Coach", subtitle: null, date: c.created_at }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    // Events ministered (responsible coach) — split by category=='aula' for classes
    const { data: events } = await supabaseAdmin
      .from("fitmind_events")
      .select("id,title,category,starts_at")
      .eq("responsible_coach_id", coachId)
      .order("starts_at", { ascending: false });
    const evList = (events || []) as Array<{ id: string; title: string; category: string; starts_at: string }>;
    const eventsMinistered: ActivityItemRow[] = evList.map((e) => ({
      id: e.id, title: e.title, subtitle: e.category, date: e.starts_at,
    }));
    const classesMinistered: ActivityItemRow[] = evList
      .filter((e) => e.category === "aula")
      .map((e) => ({ id: e.id, title: e.title, subtitle: "Turma de formação", date: e.starts_at }));

    // Current patent (most recent achievement)
    const { data: patentAch } = await supabaseAdmin
      .from("coach_patent_achievements" as never)
      .select("patent_key,patent_level,achieved_at")
      .eq("coach_id", coachId);
    let currentPatent: CurrentBadge | null = null;
    const pa = ((patentAch || []) as unknown as Array<{ patent_key: string; patent_level: number; achieved_at: string }>);
    if (pa.length) {
      const top = pa.slice().sort((a, b) => (b.patent_level || 0) - (a.patent_level || 0))[0];
      const { data: rule } = await supabaseAdmin
        .from("patent_rules")
        .select("key,display_name,image_url,badge_icon,badge_color,level")
        .eq("key", top.patent_key).maybeSingle();
      if (rule) {
        const r = rule as { key: string; display_name: string; image_url: string | null; badge_icon: string | null; badge_color: string | null; level: number };
        currentPatent = { key: r.key, name: r.display_name, image_url: r.image_url, icon: r.badge_icon, color: r.badge_color, level: r.level };
      }
    }

    // Current medal (highest threshold across both kinds)
    const { data: medalsRaw } = await supabaseAdmin
      .from("coach_medals_individual" as never)
      .select("medal_key,medal_kind,vp_amount,awarded_at")
      .eq("coach_id", coachId);
    let currentMedal: CurrentBadge | null = null;
    const earned = ((medalsRaw || []) as unknown as Array<{ medal_key: string; medal_kind: string; vp_amount: number; awarded_at: string }>);
    if (earned.length) {
      const { data: rules } = await supabaseAdmin
        .from("career_medal_rules" as never)
        .select("key,kind,display_name,threshold,image_url,icon")
        .eq("is_active", true);
      const ruleByKey = new Map<string, { key: string; display_name: string; threshold: number; image_url: string | null; icon: string | null }>();
      ((rules || []) as unknown as Array<{ key: string; display_name: string; threshold: number; image_url: string | null; icon: string | null }>)
        .forEach((r) => ruleByKey.set(r.key, r));
      let best: { rule: { key: string; display_name: string; threshold: number; image_url: string | null; icon: string | null }; threshold: number } | null = null;
      earned.forEach((e) => {
        const r = ruleByKey.get(e.medal_key);
        if (!r) return;
        if (!best || r.threshold > best.threshold) best = { rule: r, threshold: r.threshold };
      });
      if (best) {
        currentMedal = { key: best.rule.key, name: best.rule.display_name, image_url: best.rule.image_url, icon: best.rule.icon, color: null };
      }
    }

    // Enabled categories — coach_badges + flags
    const { data: badges } = await supabaseAdmin
      .from("coach_badges").select("badge_key").eq("coach_id", coachId);
    const enabledCategories: EnabledCategory[] = ((badges || []) as Array<{ badge_key: string }>)
      .map((b) => ({ key: b.badge_key, label: BADGE_LABELS[b.badge_key] || b.badge_key }));
    const { data: flags } = await supabaseAdmin
      .from("coaches")
      .select("can_create_fitmind_events,is_professional")
      .eq("id", coachId).maybeSingle();
    const f = (flags as { can_create_fitmind_events: boolean; is_professional: boolean } | null);
    if (f?.can_create_fitmind_events && !enabledCategories.some((c) => c.key === "event_creator")) {
      enabledCategories.push({ key: "event_creator", label: "Criador de eventos" });
    }
    if (f?.is_professional && !enabledCategories.some((c) => c.key === "professional")) {
      enabledCategories.push({ key: "professional", label: "Profissional" });
    }

    return {
      coachId,
      totalActiveStudents,
      totalSales,
      studentsBrought,
      studentsWinners,
      coachesTrained,
      eventsMinistered,
      classesMinistered,
      currentPatent,
      currentMedal,
      enabledCategories,
    };
  });
