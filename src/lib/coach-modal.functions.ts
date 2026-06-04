import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type CoachModalPersonRef = { id: string; name: string; email: string | null; specialty?: string | null };

export type CoachModalProduct = {
  id: string;
  name: string;
  price: number | null;
  status: string | null;
  image_url: string | null;
};

export type CoachModalTopProduct = {
  productId: string;
  name: string;
  qty: number;
  revenue: number;
};

export type CoachModalData = {
  coach: {
    id: string;
    profileId: string;
    name: string;
    email: string;
    phone: string | null;
    photoUrl: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
    isProfessional: boolean;
    isPartner: boolean;
    isMasterCoach: boolean;
    isHbl: boolean;
    specialtyLabel: string | null;
    categories: string[];
  };
  patent: { name: string; color: string | null; achievedAt: string | null } | null;
  medal: { name: string; achievedAt: string | null } | null;
  clients: { active: number; inactive: number; total: number };
  directNetwork: {
    coachCommon: number;
    coachProfessional: number;
    coachPartner: number;
    total: number;
  };
  goals: {
    travel: { current: number; target: number; pct: number; label: string };
    dinner: { current: number; target: number; pct: number; label: string };
  };
  referredPartners: { count: number; people: CoachModalPersonRef[] };
  referredProfessionals: { count: number; people: CoachModalPersonRef[] };
  products: CoachModalProduct[];
  lastSale: { at: string; amount: number; productName: string | null } | null;
  topProductsMonth: CoachModalTopProduct[];
  topProductsAllTime: CoachModalTopProduct[];
  recruitedCoachesMonth: number;
  recruitedCoachesAllTime: number;
  behavioral: {
    profile: string | null;
    recommendedProducts: string[];
  };
};

function firstOfMonthIso() {
  const d = new Date();
  d.setDate(1); d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const getCoachModalData = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ coachId: z.string().uuid() }).parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }): Promise<CoachModalData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coachId = data.coachId;

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, is_professional, specialty_key, herbalife_portal_url, upline_coach_id, created_at, last_activity_at, profiles!coaches_profile_id_fkey(id,name,email,phone,photo_url,avatar_url,last_app_login_at,created_at)")
      .eq("id", coachId)
      .maybeSingle();

    if (!coach) throw new Error("Coach não encontrado");

    const profile: any = (coach as any).profiles || {};
    const profileId = (coach as any).profile_id as string;

    // categories meta
    const [{ data: master }, { data: partner }, { data: spec }] = await Promise.all([
      supabaseAdmin.from("master_coaches").select("status").eq("coach_id", coachId).maybeSingle(),
      supabaseAdmin.from("partners").select("id").eq("profile_id", profileId).maybeSingle(),
      (coach as any).specialty_key
        ? supabaseAdmin.from("professional_specialties").select("label").eq("key", (coach as any).specialty_key).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const isMaster = !!master && ((master as any).status || "active") === "active";
    const isPartner = !!partner;
    const isHbl = !!((coach as any).herbalife_portal_url && String((coach as any).herbalife_portal_url).trim());
    const specialtyLabel = (spec as any)?.label || null;
    const categories: string[] = [];
    if (isMaster) categories.push("Master Coach");
    if (specialtyLabel) categories.push(specialtyLabel);
    if (isHbl) categories.push("Coach HBL");
    if (isPartner) categories.push("Parceiro");

    // Patent and medal history
    const [{ data: patentAch }, { data: medalAch }] = await Promise.all([
      supabaseAdmin.from("coach_patent_achievements").select("patent_key,patent_level,achieved_at").eq("coach_id", coachId).order("achieved_at", { ascending: false }).limit(1),
      supabaseAdmin.from("coach_medals_individual").select("medal_key,medal_kind,awarded_at").eq("coach_id", coachId).order("awarded_at", { ascending: false }).limit(1),
    ]);
    let patent: CoachModalData["patent"] = null;
    if (patentAch && patentAch.length) {
      const row: any = patentAch[0];
      const { data: rule } = await supabaseAdmin.from("patent_rules").select("display_name,badge_color").eq("key", row.patent_key).maybeSingle();
      patent = { name: (rule as any)?.display_name || row.patent_key, color: (rule as any)?.badge_color || null, achievedAt: row.achieved_at };
    }
    let medal: CoachModalData["medal"] = null;
    if (medalAch && medalAch.length) {
      const row: any = medalAch[0];
      const { data: rule } = await supabaseAdmin.from("career_medal_rules").select("display_name").eq("key", row.medal_key).maybeSingle();
      medal = { name: (rule as any)?.display_name || row.medal_key, achievedAt: row.awarded_at };
    }

    // Clients (students of this coach) - active = had attendance in last 15 days
    const { data: students } = await supabaseAdmin.from("students").select("id, profile_id").eq("coach_id", coachId);
    const studentRows = (students as Array<{ id: string; profile_id: string }> | null) || [];
    const studentIds = studentRows.map((s) => s.id);
    let activeCount = 0, inactiveCount = 0;
    if (studentIds.length) {
      const since = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);
      const { data: logs } = await supabaseAdmin
        .from("attendance_logs")
        .select("student_id")
        .in("student_id", studentIds)
        .gte("log_date", since)
        .eq("attended", true);
      const activeSet = new Set(((logs as Array<{ student_id: string }> | null) || []).map((l) => l.student_id));
      activeCount = activeSet.size;
      inactiveCount = studentIds.length - activeCount;
    }

    // Direct network breakdown
    const { data: directCoaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, is_professional")
      .eq("upline_coach_id", coachId);
    const direct = (directCoaches as Array<{ id: string; profile_id: string; is_professional: boolean | null }> | null) || [];
    const directProfileIds = direct.map((c) => c.profile_id);
    let partnerProfileSet = new Set<string>();
    if (directProfileIds.length) {
      const { data: dp } = await supabaseAdmin.from("partners").select("profile_id").in("profile_id", directProfileIds);
      partnerProfileSet = new Set(((dp as Array<{ profile_id: string }> | null) || []).map((p) => p.profile_id));
    }
    const directNetwork = {
      coachCommon: 0,
      coachProfessional: 0,
      coachPartner: 0,
      total: direct.length,
    };
    direct.forEach((c) => {
      if (partnerProfileSet.has(c.profile_id)) directNetwork.coachPartner += 1;
      else if (c.is_professional) directNetwork.coachProfessional += 1;
      else directNetwork.coachCommon += 1;
    });

    // Goals current month
    const monthRef = new Date().toISOString().slice(0, 7) + "-01";
    const { data: goalsRow } = await supabaseAdmin
      .from("coach_goals")
      .select("new_students,revenue")
      .eq("coach_id", coachId)
      .eq("reference_month", monthRef)
      .maybeSingle();
    const travelTarget = 100; // alunos ativos do mês para viagem
    const dinnerRevenueTarget = Number((goalsRow as any)?.revenue || 0) || 6000;
    const travelCurrent = activeCount;
    // dinner: revenue this month
    const fromMonth = firstOfMonthIso();
    const monthTx = studentIds.length
      ? await supabaseAdmin
          .from("transactions")
          .select("gross_amount,paid_at")
          .in("student_id", studentIds)
          .eq("status", "paid")
          .gte("paid_at", fromMonth)
      : { data: [] as any[] };
    const dinnerCurrent = ((monthTx.data as Array<{ gross_amount: number }> | null) || []).reduce((s, r) => s + Number(r.gross_amount || 0), 0);
    const goals = {
      travel: {
        current: travelCurrent,
        target: travelTarget,
        pct: Math.min(100, Math.round((travelCurrent / travelTarget) * 100)),
        label: "Viagem (alunos ativos)",
      },
      dinner: {
        current: dinnerCurrent,
        target: dinnerRevenueTarget,
        pct: Math.min(100, Math.round((dinnerCurrent / dinnerRevenueTarget) * 100)),
        label: "Jantar (faturamento do mês)",
      },
    };

    // Partners & professionals he referred
    // Heuristic: partners/professionals whose profile is a student of this coach
    let referredPartners: CoachModalData["referredPartners"] = { count: 0, people: [] };
    let referredProfessionals: CoachModalData["referredProfessionals"] = { count: 0, people: [] };
    if (studentRows.length) {
      const profileIds = studentRows.map((s) => s.profile_id);
      const [{ data: ps }, { data: pros }] = await Promise.all([
        supabaseAdmin.from("partners").select("id, profile_id, fantasy_name, profiles!partners_profile_id_fkey(name,email)").in("profile_id", profileIds),
        supabaseAdmin.from("coaches").select("id, profile_id, is_professional, specialty_key, specialty_custom_description, profiles!coaches_profile_id_fkey(name,email)").in("profile_id", profileIds).eq("is_professional", true),
      ]);
      const partnerRows = (ps as any[] | null) || [];
      const proRows = (pros as any[] | null) || [];
      // Resolve specialty labels
      const specKeys = Array.from(new Set(proRows.map((p) => p.specialty_key).filter(Boolean)));
      const specLabel = new Map<string, string>();
      if (specKeys.length) {
        const { data: specs } = await supabaseAdmin.from("professional_specialties").select("key,label").in("key", specKeys);
        ((specs as Array<{ key: string; label: string }> | null) || []).forEach((s) => specLabel.set(s.key, s.label));
      }
      referredPartners = {
        count: partnerRows.length,
        people: partnerRows.map((p) => ({
          id: p.id,
          name: p.fantasy_name || p.profiles?.name || "Parceiro",
          email: p.profiles?.email || null,
        })),
      };
      referredProfessionals = {
        count: proRows.length,
        people: proRows.map((p) => ({
          id: p.id,
          name: p.profiles?.name || "Profissional",
          email: p.profiles?.email || null,
          specialty: (p.specialty_key && specLabel.get(p.specialty_key)) || p.specialty_custom_description || null,
        })),
      };

    }

    // Professional products
    let products: CoachModalProduct[] = [];
    if ((coach as any).is_professional) {
      const { data: pp } = await supabaseAdmin
        .from("professional_products")
        .select("id,name,price,status,image_url")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false });
      products = ((pp as any[] | null) || []).map((p) => ({
        id: p.id, name: p.name, price: p.price == null ? null : Number(p.price), status: p.status, image_url: p.image_url,
      }));
    }

    // Sales (transactions of this coach's students) - last sale + top products
    let lastSale: CoachModalData["lastSale"] = null;
    const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
    const topMonthMap = new Map<string, { name: string; qty: number; revenue: number }>();
    if (studentIds.length) {
      const { data: tx } = await supabaseAdmin
        .from("transactions")
        .select("gross_amount,paid_at,product_id,products(name)")
        .in("student_id", studentIds)
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false });
      const txRows = (tx as any[] | null) || [];
      if (txRows.length) {
        const t0 = txRows[0];
        lastSale = {
          at: t0.paid_at,
          amount: Number(t0.gross_amount || 0),
          productName: t0.products?.name || null,
        };
      }
      const monthStart = fromMonth;
      for (const t of txRows) {
        const pid = t.product_id || "outros";
        const name = t.products?.name || "Outros";
        const amount = Number(t.gross_amount || 0);
        const e = topMap.get(pid) || { name, qty: 0, revenue: 0 };
        e.qty += 1; e.revenue += amount; topMap.set(pid, e);
        if (t.paid_at && t.paid_at >= monthStart) {
          const em = topMonthMap.get(pid) || { name, qty: 0, revenue: 0 };
          em.qty += 1; em.revenue += amount; topMonthMap.set(pid, em);
        }
      }
    }
    const toList = (m: Map<string, { name: string; qty: number; revenue: number }>): CoachModalTopProduct[] =>
      Array.from(m.entries())
        .map(([productId, v]) => ({ productId, name: v.name, qty: v.qty, revenue: v.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    // Recruited coaches (downline created this month vs all time)
    const allDownline = await supabaseAdmin
      .from("coaches")
      .select("id, created_at")
      .eq("upline_coach_id", coachId);
    const downRows = (allDownline.data as Array<{ id: string; created_at: string }> | null) || [];
    const recruitedCoachesAllTime = downRows.length;
    const recruitedCoachesMonth = downRows.filter((r) => r.created_at && r.created_at >= fromMonth).length;

    return {
      coach: {
        id: coachId,
        profileId,
        name: profile.name || "Coach",
        email: profile.email || "",
        phone: profile.phone || null,
        photoUrl: profile.photo_url || profile.avatar_url || null,
        createdAt: profile.created_at || (coach as any).created_at || null,
        lastLoginAt: profile.last_app_login_at || (coach as any).last_activity_at || null,
        isProfessional: !!(coach as any).is_professional,
        isPartner,
        isMasterCoach: isMaster,
        isHbl,
        specialtyLabel,
        categories,
      },
      patent,
      medal,
      clients: { active: activeCount, inactive: inactiveCount, total: studentIds.length },
      directNetwork,
      goals,
      referredPartners,
      referredProfessionals,
      products,
      lastSale,
      topProductsMonth: toList(topMonthMap),
      topProductsAllTime: toList(topMap),
      recruitedCoachesMonth,
      recruitedCoachesAllTime,
      behavioral: { profile: null, recommendedProducts: [] },
    };
  });
