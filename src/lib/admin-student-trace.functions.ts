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
      coachMap = new Map<string, string>((coaches || []).map((c) => [c.id, cpMap.get(c.profile_id) || ""]));
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
  /** Cliques em links de indicação registrados no servidor. */
  touches: {
    id: string;
    code: string;
    sponsorName: string | null;
    coachId: string | null;
    coachName: string | null;
    landingPath: string | null;
    productId: string | null;
    createdAt: string;
    claimed: boolean;
  }[];
  /** Coach do link divergente do coach gravado. */
  coachMismatch: { linkCoachId: string; linkCoachName: string | null; code: string } | null;
  /** Como a conta foi criada: apple, google, e-mail/senha… */
  signupProvider: string | null;
  purchases: {
    id: string;
    description: string | null;
    amount: number;
    paymentMethod: string | null;
    status: string | null;
    paidAt: string | null;
    createdAt: string | null;
  }[];
  annualFee: { paid: boolean; paidAt: string | null; amount: number | null; source: string | null };
  profileSubscription: {
    status: string | null;
    paidUntil: string | null;
    nextInvoiceMonth: string | null;
    paymentMethod: string | null;
    invoices: { month: string | null; dueDate: string | null; amount: number | null; status: string | null; paidAt: string | null; method: string | null }[];
  } | null;
  profilesOwned: { kind: string; createdAt: string | null; status: string | null }[];
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
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, status")
      .eq("student_id", student.id)
      .eq("status", "active")
      .limit(1);

    // ---- Origem do link: toques registrados no servidor ----
    const { data: touchRows } = await supabaseAdmin
      .from("referral_touches")
      .select("id, code, sponsor_name, coach_id, landing_path, product_id, created_at, claimed_profile_id")
      .or(`claimed_profile_id.eq.${student.profile_id}`)
      .order("created_at", { ascending: false })
      .limit(10);

    const touchList = (touchRows || []) as any[];
    const coachIdsToName = Array.from(
      new Set(touchList.map((t) => t.coach_id).filter(Boolean)),
    ) as string[];
    const coachNames = new Map<string, string | null>();
    if (coachIdsToName.length) {
      const { data: cs } = await supabaseAdmin
        .from("coaches").select("id, profile_id").in("id", coachIdsToName);
      const profIds = (cs || []).map((c: any) => c.profile_id);
      const { data: ps } = await supabaseAdmin
        .from("profiles").select("id, name").in("id", profIds.length ? profIds : ["00000000-0000-0000-0000-000000000000"]);
      const nameByProfile = new Map((ps || []).map((p: any) => [p.id, p.name as string | null]));
      for (const c of cs || []) coachNames.set((c as any).id, nameByProfile.get((c as any).profile_id) ?? null);
    }

    const touches: StudentTrace["touches"] = touchList.map((t) => ({
      id: t.id,
      code: t.code,
      sponsorName: t.sponsor_name ?? null,
      coachId: t.coach_id ?? null,
      coachName: t.coach_id ? coachNames.get(t.coach_id) ?? t.sponsor_name ?? null : null,
      landingPath: t.landing_path ?? null,
      productId: t.product_id ?? null,
      createdAt: t.created_at,
      claimed: Boolean(t.claimed_profile_id),
    }));

    const linkTouch = touches.find((t) => t.coachId);
    const coachMismatch =
      linkTouch?.coachId && student.coach_id && linkTouch.coachId !== student.coach_id
        ? { linkCoachId: linkTouch.coachId, linkCoachName: linkTouch.coachName, code: linkTouch.code }
        : null;

    // ---- Como a conta foi criada ----
    let signupProvider: string | null = null;
    if (prof?.user_id) {
      try {
        const { data: au } = await supabaseAdmin.auth.admin.getUserById(prof.user_id);
        const meta = (au?.user?.app_metadata ?? {}) as { provider?: string; providers?: string[] };
        signupProvider = meta.provider || (meta.providers || [])[0] || "email";
      } catch { /* sem acesso ao auth: segue sem provider */ }
    }

    // ---- Compras ----
    const { data: txs } = await supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, payment_method, status, paid_at, created_at, product_id, purchase_type, metadata")
      .eq("student_id", student.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const productIds = Array.from(new Set((txs || []).map((t: any) => t.product_id).filter(Boolean))) as string[];
    const productNames = new Map<string, string>();
    if (productIds.length) {
      const { data: prods } = await supabaseAdmin.from("products").select("id, name").in("id", productIds);
      for (const p of prods || []) productNames.set((p as any).id, (p as any).name);
    }
    const purchases: StudentTrace["purchases"] = (txs || []).map((t: any) => ({
      id: t.id,
      description:
        (t.product_id ? productNames.get(t.product_id) : null) ||
        (t.metadata as any)?.description ||
        t.purchase_type ||
        null,
      amount: Number(t.gross_amount || 0),
      paymentMethod: t.payment_method ?? null,
      status: t.status ?? null,
      paidAt: t.paid_at ?? null,
      createdAt: t.created_at ?? null,
    }));

    // ---- Perfis que a pessoa tem + anuidade + mensalidade ----
    const profilesOwned: StudentTrace["profilesOwned"] = [
      { kind: "Aluno", createdAt: student.created_at || null, status: prof?.status || null },
    ];
    let annualFee: StudentTrace["annualFee"] = { paid: false, paidAt: null, amount: null, source: null };

    const { data: coachRow } = await supabaseAdmin
      .from("coaches")
      .select("id, created_at, is_professional, activation_paid_at")
      .eq("profile_id", student.profile_id)
      .maybeSingle();
    if (coachRow) {
      profilesOwned.push({
        kind: (coachRow as any).is_professional ? "Profissional" : "Coach",
        createdAt: (coachRow as any).created_at || null,
        status: (coachRow as any).activation_paid_at ? "ativo" : "aguardando anuidade",
      });
      if ((coachRow as any).activation_paid_at) {
        annualFee = { paid: true, paidAt: (coachRow as any).activation_paid_at, amount: null, source: "coach" };
      }
    }
    const { data: partnerRow } = await supabaseAdmin
      .from("partners")
      .select("id, created_at, status, activation_paid_at, activation_source")
      .eq("profile_id", student.profile_id)
      .maybeSingle();
    if (partnerRow) {
      profilesOwned.push({
        kind: "Parceiro",
        createdAt: (partnerRow as any).created_at || null,
        status: (partnerRow as any).status || null,
      });
      if ((partnerRow as any).activation_paid_at) {
        annualFee = {
          paid: true,
          paidAt: (partnerRow as any).activation_paid_at,
          amount: null,
          source: (partnerRow as any).activation_source || "parceiro",
        };
      }
    }

    let profileSubscription: StudentTrace["profileSubscription"] = null;
    if (prof?.user_id && (coachRow || partnerRow)) {
      const { data: us } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id, status, paid_until, next_invoice_month, preferred_payment_method")
        .eq("user_id", prof.user_id)
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (us) {
        const { data: invs } = await supabaseAdmin
          .from("subscription_invoices")
          .select("reference_month, due_date, amount, status, paid_at, payment_method")
          .eq("user_subscription_id", (us as any).id)
          .order("due_date", { ascending: false })
          .limit(12);
        profileSubscription = {
          status: (us as any).status ?? null,
          paidUntil: (us as any).paid_until ?? null,
          nextInvoiceMonth: (us as any).next_invoice_month ?? null,
          paymentMethod: (us as any).preferred_payment_method ?? null,
          invoices: (invs || []).map((i: any) => ({
            month: i.reference_month ?? null,
            dueDate: i.due_date ?? null,
            amount: i.amount === null ? null : Number(i.amount),
            status: i.status ?? null,
            paidAt: i.paid_at ?? null,
            method: i.payment_method ?? null,
          })),
        };
      }
    }

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
      touches,
      coachMismatch,
      signupProvider,
      purchases,
      annualFee,
      profileSubscription,
      profilesOwned,
    };

  });
