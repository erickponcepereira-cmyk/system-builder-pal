import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export type StudentSearchResult = {
  studentId: string;
  profileId: string;
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  coachName: string | null;
};

export const adminSearchStudents = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ q: z.string().min(2).max(120) }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<StudentSearchResult[]> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    await assertAdminProfile(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const q = data.q.trim();
    const like = `%${q}%`;

    // Search profiles by name/email/phone
    const { data: profs, error: perr } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, name, email, phone")
      .or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(30);
    if (perr) throw new Error(perr.message);

    let profileIds = (profs || []).map((p) => p.id);

    // Also search by referral_code on students
    const { data: byCode } = await supabaseAdmin
      .from("students")
      .select("profile_id")
      .ilike("referral_code", like)
      .limit(30);
    for (const r of byCode || []) if (r.profile_id && !profileIds.includes(r.profile_id)) profileIds.push(r.profile_id);

    if (profileIds.length === 0) return [];

    const { data: studs, error: serr } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, coach_id")
      .in("profile_id", profileIds)
      .limit(30);
    if (serr) throw new Error(serr.message);

    const coachIds = Array.from(new Set((studs || []).map((s) => s.coach_id).filter(Boolean))) as string[];
    let coachMap = new Map<string, string>();
    if (coachIds.length > 0) {
      const { data: coaches } = await supabaseAdmin
        .from("coaches")
        .select("id, profile_id")
        .in("id", coachIds);
      const cpIds = (coaches || []).map((c) => c.profile_id);
      const { data: cprofs } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .in("id", cpIds);
      const cpMap = new Map((cprofs || []).map((p) => [p.id, p.name as string | null]));
      coachMap = new Map((coaches || []).map((c) => [c.id, cpMap.get(c.profile_id) || null]));
    }

    const profMap = new Map((profs || []).map((p) => [p.id, p]));
    // Include profs discovered only via referral_code
    const missingProfileIds = profileIds.filter((id) => !profMap.has(id));
    if (missingProfileIds.length > 0) {
      const { data: extra } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, name, email, phone")
        .in("id", missingProfileIds);
      for (const p of extra || []) profMap.set(p.id, p);
    }

    return (studs || []).map((s) => {
      const p = profMap.get(s.profile_id);
      return {
        studentId: s.id,
        profileId: s.profile_id,
        userId: p?.user_id || "",
        name: p?.name || null,
        email: p?.email || null,
        phone: p?.phone || null,
        coachName: s.coach_id ? coachMap.get(s.coach_id) || null : null,
      };
    });
  });

export type TraceOrigin =
  | { type: "student_referral"; referrerStudentId: string; referrerName: string | null; referrerEmail: string | null; referrerCode: string | null; referrerCoachName: string | null }
  | { type: "partner"; partnerId: string; partnerName: string | null; partnerCode: string | null; partnerCity: string | null }
  | { type: "fineshape_import"; clientId: string; clientName: string | null; importedByCoachName: string | null; importedAt: string | null }
  | { type: "lead"; leadId: string; source: string | null; referralCode: string | null; leadCreatedAt: string | null; leadCoachName: string | null }
  | { type: "direct"; note: string }
  | { type: "unknown" };

export type StudentTrace = {
  student: {
    studentId: string;
    profileId: string;
    userId: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    city: string | null;
    referralCode: string | null;
    profileCreatedAt: string | null;
    studentCreatedAt: string | null;
    status: string | null;
  };
  coach: { coachId: string; name: string | null; email: string | null; phone: string | null } | null;
  origin: TraceOrigin;
  referralChain: { studentId: string; name: string | null; code: string | null }[];
  activity: {
    lastAssessmentAt: string | null;
    lastTransactionAt: string | null;
    activeSubscription: boolean;
  };
};

export const adminTraceStudent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ studentId: uuid }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<StudentTrace> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    await assertAdminProfile(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student, error: serr } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, coach_id, referred_by_student_id, partner_id, referral_code, created_at")
      .eq("id", data.studentId)
      .maybeSingle();
    if (serr) throw new Error(serr.message);
    if (!student) throw new Error("Aluno não encontrado.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, name, email, phone, city, status, created_at")
      .eq("id", student.profile_id)
      .maybeSingle();

    // Coach
    let coach: StudentTrace["coach"] = null;
    if (student.coach_id) {
      const { data: c } = await supabaseAdmin
        .from("coaches")
        .select("id, profile_id")
        .eq("id", student.coach_id)
        .maybeSingle();
      if (c) {
        const { data: cp } = await supabaseAdmin
          .from("profiles")
          .select("name, email, phone")
          .eq("id", c.profile_id)
          .maybeSingle();
        coach = {
          coachId: c.id,
          name: cp?.name || null,
          email: cp?.email || null,
          phone: cp?.phone || null,
        };
      }
    }

    // Origin detection
    let origin: TraceOrigin = { type: "unknown" };

    if (student.referred_by_student_id) {
      const { data: refStud } = await supabaseAdmin
        .from("students")
        .select("id, profile_id, coach_id, referral_code")
        .eq("id", student.referred_by_student_id)
        .maybeSingle();
      let refName: string | null = null;
      let refEmail: string | null = null;
      let refCoachName: string | null = null;
      if (refStud) {
        const { data: rp } = await supabaseAdmin
          .from("profiles").select("name, email").eq("id", refStud.profile_id).maybeSingle();
        refName = rp?.name || null;
        refEmail = rp?.email || null;
        if (refStud.coach_id) {
          const { data: rc } = await supabaseAdmin
            .from("coaches").select("profile_id").eq("id", refStud.coach_id).maybeSingle();
          if (rc) {
            const { data: rcp } = await supabaseAdmin
              .from("profiles").select("name").eq("id", rc.profile_id).maybeSingle();
            refCoachName = rcp?.name || null;
          }
        }
      }
      origin = {
        type: "student_referral",
        referrerStudentId: student.referred_by_student_id,
        referrerName: refName,
        referrerEmail: refEmail,
        referrerCode: refStud?.referral_code || null,
        referrerCoachName: refCoachName,
      };
    } else if (student.partner_id) {
      const { data: partner } = await supabaseAdmin
        .from("partners")
        .select("id, fantasy_name, referral_code, city")
        .eq("id", student.partner_id)
        .maybeSingle();
      origin = {
        type: "partner",
        partnerId: student.partner_id,
        partnerName: partner?.fantasy_name || null,
        partnerCode: partner?.referral_code || null,
        partnerCity: partner?.city || null,
      };
    } else {
      // Fineshape import?
      const { data: cec } = await supabaseAdmin
        .from("coach_evaluation_clients")
        .select("id, coach_id, name, created_at")
        .eq("student_id", student.id)
        .maybeSingle();
      if (cec) {
        let byCoach: string | null = null;
        if (cec.coach_id) {
          const { data: c } = await supabaseAdmin
            .from("coaches").select("profile_id").eq("id", cec.coach_id).maybeSingle();
          if (c) {
            const { data: p } = await supabaseAdmin
              .from("profiles").select("name").eq("id", c.profile_id).maybeSingle();
            byCoach = p?.name || null;
          }
        }
        origin = {
          type: "fineshape_import",
          clientId: cec.id,
          clientName: cec.name || null,
          importedByCoachName: byCoach,
          importedAt: cec.created_at || null,
        };
      } else if (prof?.email || prof?.phone) {
        // Lead prévio?
        const filters: string[] = [];
        if (prof.email) filters.push(`email.ilike.${prof.email}`);
        if (prof.phone) filters.push(`phone.ilike.${prof.phone}`);
        const { data: leads } = await supabaseAdmin
          .from("leads")
          .select("id, source, referral_code, coach_id, created_at")
          .or(filters.join(","))
          .order("created_at", { ascending: true })
          .limit(1);
        const lead = leads?.[0];
        if (lead) {
          let leadCoach: string | null = null;
          if (lead.coach_id) {
            const { data: c } = await supabaseAdmin
              .from("coaches").select("profile_id").eq("id", lead.coach_id).maybeSingle();
            if (c) {
              const { data: p } = await supabaseAdmin
                .from("profiles").select("name").eq("id", c.profile_id).maybeSingle();
              leadCoach = p?.name || null;
            }
          }
          origin = {
            type: "lead",
            leadId: lead.id,
            source: lead.source || null,
            referralCode: lead.referral_code || null,
            leadCreatedAt: lead.created_at || null,
            leadCoachName: leadCoach,
          };
        } else if (student.coach_id) {
          origin = { type: "direct", note: "Cadastro direto via link/painel do coach atual, sem indicador aluno, parceiro, importação ou lead prévio." };
        }
      }
    }

    // Referral chain (upstream)
    const chain: StudentTrace["referralChain"] = [];
    const seen = new Set<string>([student.id]);
    let cursor: string | null = student.referred_by_student_id;
    let depth = 0;
    while (cursor && depth < 20 && !seen.has(cursor)) {
      seen.add(cursor);
      const { data: up } = await supabaseAdmin
        .from("students")
        .select("id, profile_id, referred_by_student_id, referral_code")
        .eq("id", cursor)
        .maybeSingle();
      if (!up) break;
      const { data: upProf } = await supabaseAdmin
        .from("profiles").select("name").eq("id", up.profile_id).maybeSingle();
      chain.push({ studentId: up.id, name: upProf?.name || null, code: up.referral_code || null });
      cursor = up.referred_by_student_id;
      depth++;
    }

    // Activity
    const { data: lastAssess } = await supabaseAdmin
      .from("coach_body_assessments")
      .select("assessment_date")
      .eq("student_id", student.id)
      .order("assessment_date", { ascending: false })
      .limit(1);
    const { data: lastTx } = await supabaseAdmin
      .from("transactions")
      .select("created_at")
      .eq("payer_profile_id", student.profile_id)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status")
      .eq("student_id", student.id)
      .in("status", ["active", "trialing"])
      .limit(1);

    return {
      student: {
        studentId: student.id,
        profileId: student.profile_id,
        userId: prof?.user_id || "",
        name: prof?.name || null,
        email: prof?.email || null,
        phone: prof?.phone || null,
        city: prof?.city || null,
        referralCode: student.referral_code || null,
        profileCreatedAt: prof?.created_at || null,
        studentCreatedAt: student.created_at || null,
        status: prof?.status || null,
      },
      coach,
      origin,
      referralChain: chain,
      activity: {
        lastAssessmentAt: (lastAssess?.[0] as any)?.assessment_date || null,
        lastTransactionAt: (lastTx?.[0] as any)?.created_at || null,
        activeSubscription: (sub?.length || 0) > 0,
      },
    };
  });
