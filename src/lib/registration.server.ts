import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isValidCPF } from "@/lib/masks";

export type FinalizeRegistrationInput = {
  userId: string;
  role: "coach" | "student";
  name: string;
  email: string;
  phone?: string | null;
  cpf?: string | null;
  birthdate?: string | null;
  bio?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  coach?: {
    uplineCoachId: string;
    pixKey?: string | null;
    pixKeyType?: string | null;
    bankName?: string | null;
    bankAgency?: string | null;
    bankAccount?: string | null;
    bankAccountType?: string | null;
    referralCode?: string | null;
    referralLink?: string | null;
    completedCoachCourse?: boolean;
    coachCourseNotes?: string | null;
    alreadyCoach?: boolean;
    activationNote?: string | null;
    isProfessional?: boolean;
    specialtyKey?: string | null;
    specialtyCustomDescription?: string | null;
    professionalCouncil?: string | null;
    councilNumber?: string | null;
  };
  student?: {
    coachId: string;
    referredByStudentId?: string | null;
    referralCode?: string | null;
    partnerId?: string | null;
  };
};

const clean = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const digits = (value?: string | null) => clean(value)?.replace(/\D/g, "") || null;

const makeReferralCode = () =>
  `FC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const SYSTEM_FALLBACK_COACH_ID = "f9a44c8a-31ea-4ca1-8cef-b9049733c5e1";

async function getFallbackCoachId() {
  const { data: configured } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("id", SYSTEM_FALLBACK_COACH_ID)
    .maybeSingle();
  if (configured?.id) return configured.id;

  const { data: adminCoach } = await supabaseAdmin
    .from("coaches")
    .select("id, profiles!coaches_profile_id_fkey(role)")
    .not("approved_at", "is", null)
    .is("blocked_at", null)
    .eq("profiles.role", "admin")
    .limit(1)
    .maybeSingle();
  if ((adminCoach as any)?.id) return (adminCoach as any).id as string;

  const { data: anyCoach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .not("approved_at", "is", null)
    .is("blocked_at", null)
    .limit(1)
    .maybeSingle();
  if (anyCoach?.id) return anyCoach.id;

  throw new Error("Não há coach ativo para vincular o perfil de aluno automaticamente.");
}

export async function ensureStudentForProfile(profileId: string, preferredCoachId?: string | null, partnerId?: string | null) {
  const { data: existing } = await supabaseAdmin
    .from("students")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const coachId = clean(preferredCoachId) || await getFallbackCoachId();
  let referralCode = makeReferralCode();
  let lastError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("students")
      .insert({
        profile_id: profileId,
        coach_id: coachId,
        referral_code: referralCode,
        referral_link: `/i/${referralCode}`,
        partner_id: clean(partnerId),
      })
      .select("id")
      .single();
    if (!error && data?.id) return data.id;
    lastError = error;
    if (error?.code !== "23505") break;
    referralCode = makeReferralCode();
  }
  throw new Error(lastError?.message || "Não foi possível criar o perfil de aluno.");
}

export async function finalizeRegistration(input: FinalizeRegistrationInput) {
  try {
    return await finalizeRegistrationInner(input);
  } catch (err) {
    // Compensação: se algo falhou após o profile ter sido criado, removemos
    // profile + auth user para que o cadastro possa ser refeito do zero.
    // Sem isso, o usuário fica "preso" com perfil ativo sem coach/student.
    try {
      const email = input.email.trim().toLowerCase();
      const { data: orphanProfile } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, role")
        .eq("user_id", input.userId)
        .maybeSingle();
      if (orphanProfile && orphanProfile.role !== "admin") {
        // Só remove se não há coach nem student vinculado (ou seja, está realmente quebrado)
        const [{ count: coachCount }, { count: studentCount }] = await Promise.all([
          supabaseAdmin.from("coaches").select("id", { count: "exact", head: true }).eq("profile_id", orphanProfile.id),
          supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("profile_id", orphanProfile.id),
        ]);
        if (!coachCount && !studentCount) {
          await supabaseAdmin.from("profiles").delete().eq("id", orphanProfile.id);
          await supabaseAdmin.auth.admin.deleteUser(orphanProfile.user_id).catch(() => {});
        }
      }
    } catch {
      // compensação best-effort; não mascarar o erro original
    }
    throw err;
  }
}

async function finalizeRegistrationInner(input: FinalizeRegistrationInput) {
  const email = input.email.trim().toLowerCase();
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(input.userId);
  let userId = userData.user?.id || input.userId;

  if (userError || !userData.user) {
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    const matchedUser = usersData?.users.find((user) => (user.email || "").toLowerCase() === email);

    if (listError || !matchedUser) {
      throw new Error("Conta de acesso não encontrada. Tente criar a conta novamente.");
    }

    userId = matchedUser.id;
  }

  const accountEmail = userData.user?.email || email;
  if (accountEmail.toLowerCase() !== email) {
    throw new Error("O e-mail da conta não confere com o cadastro informado.");
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingProfile?.role === "admin") {
    throw new Error("Este usuário não pode ser alterado pelo cadastro público.");
  }

  // Detecta CPF já em uso por outro usuário (evita erro genérico de unique constraint)
  const cpfDigits = digits(input.cpf);
  if (cpfDigits) {
    if (!isValidCPF(cpfDigits)) {
      throw new Error("CPF inválido. Verifique os dados informados.");
    }
    const { data: cpfClash } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, email")
      .eq("cpf", cpfDigits)
      .neq("user_id", userId)
      .maybeSingle();
    if (cpfClash) {
      throw new Error("Já existe uma conta cadastrada com este CPF.");
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        name: input.name.trim(),
        email,
        role: input.role,
        phone: digits(input.phone),
        cpf: cpfDigits,
        birthdate: clean(input.birthdate),
        bio: clean(input.bio),
        gender: clean((input as { gender?: string | null }).gender) || null,
        instagram: clean((input as { instagram?: string | null }).instagram)?.replace(/^@/, "").slice(0, 100) || null,
        street: clean(input.street),
        number: clean(input.number),
        neighborhood: clean(input.neighborhood),
        city: clean(input.city),
        state: clean(input.state)?.toUpperCase() || null,
        zip_code: digits(input.zipCode),
        status: "active",
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .single();

  if (profileError || !profile) {
    if (profileError?.code === "23505" && profileError.message?.includes("cpf")) {
      throw new Error("Já existe uma conta cadastrada com este CPF.");
    }
    throw new Error(profileError?.message || "Não foi possível salvar o perfil.");
  }


  if (input.role === "coach") {
    if (!input.coach?.uplineCoachId) {
      throw new Error("Selecione um coach indicador para concluir o cadastro.");
    }

    const isProfessional = input.coach.isProfessional ?? false;
    const isAlreadyCoach = input.coach.alreadyCoach ?? false;
    // Profissional novo NÃO é auto-aprovado: passa pelo mesmo fluxo (pagamento da anuidade + liberação do admin).
    // Só ganha aprovação imediata quem marcou "já sou coach/profissional" (upgrade de conta existente com ativação prévia).
    const coachApprovedAt = isAlreadyCoach && isProfessional ? new Date().toISOString() : null;
    const nowIso = new Date().toISOString();
    const activationPatch = isAlreadyCoach
      ? {
          already_coach: true,
          activation_paid_at: nowIso,
          activation_source: isProfessional ? "already_professional" : "already_coach",
          activation_note: clean(input.coach.activationNote),
        }
      : {};
    let referralCode = clean(input.coach.referralCode) || makeReferralCode();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { error: coachError } = await supabaseAdmin.from("coaches").upsert(
        {
          profile_id: profile.id,
          referral_code: referralCode,
          referral_link: clean(input.coach.referralLink) || `/r/${referralCode}`,
          upline_coach_id: input.coach.uplineCoachId,
          pix_key: clean(input.coach.pixKey),
          pix_key_type: clean(input.coach.pixKeyType),
          bank_name: clean(input.coach.bankName),
          bank_agency: clean(input.coach.bankAgency),
          bank_account: clean(input.coach.bankAccount),
          bank_account_type: clean(input.coach.bankAccountType),
          completed_coach_course: input.coach.completedCoachCourse ?? false,
          coach_course_notes: clean(input.coach.coachCourseNotes),
          is_professional: isProfessional,
          specialty_key: clean(input.coach.specialtyKey),
          specialty_custom_description: clean(input.coach.specialtyCustomDescription),
          professional_council: clean(input.coach.professionalCouncil),
          council_number: clean(input.coach.councilNumber),
          specialty_pending_setup: (input.coach.specialtyKey || "").toLowerCase() === "other",
          approved_at: coachApprovedAt,
          onboarding_stage: coachApprovedAt ? "released" : "awaiting_payment",
          ...activationPatch,
        },
        { onConflict: "profile_id" }
      );

      if (!coachError) {
        // Profissional já nasce com coach liberado; coach comum segue pendente até concluir o fluxo.
        await supabaseAdmin
          .from("profiles")
          .update({ status: isProfessional ? "active" : "pending" })
          .eq("id", profile.id);

        // Cria registro de aluno para o coach (acesso ao app do aluno mesmo pendente).
        await ensureStudentForProfile(profile.id, input.coach.uplineCoachId);
        return { ok: true, profileId: profile.id, role: input.role };
      }
      if (coachError.code !== "23505") throw new Error(coachError.message);
      referralCode = makeReferralCode();
    }

    throw new Error("Não foi possível gerar um código de indicação único.");
  }

  if (!input.student?.coachId) {
    throw new Error("Selecione um coach para concluir o cadastro de aluno.");
  }

  // Gera código de indicação único para o próprio aluno (não confundir com o código do padrinho usado no convite)
  let studentReferralCode = makeReferralCode();
  let studentError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await supabaseAdmin.from("students").upsert(
      {
        profile_id: profile.id,
        coach_id: input.student.coachId,
        referred_by_student_id: input.student.referredByStudentId || null,
        referral_code: studentReferralCode,
        partner_id: input.student.partnerId || null,
      },
      { onConflict: "profile_id" }
    );
    if (!error) { studentError = null; break; }
    studentError = error;
    if (error.code !== "23505") break;
    studentReferralCode = makeReferralCode();
  }

  if (studentError) throw new Error(studentError.message);

  return { ok: true, profileId: profile.id, role: input.role };
}

export type FinalizePartnerInput = {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  fantasyName: string;
  document: string;
  documentType: "cnpj" | "cpf";
  whatsapp: string;
  city?: string | null;
  state?: string | null;
  businessArea?: string | null;
  specialty?: string | null;
  uplineCoachId: string;
  alreadyPartner?: boolean;
  activationNote?: string | null;
};

export async function finalizePartnerRegistration(input: FinalizePartnerInput) {
  const email = input.email.trim().toLowerCase();
  const phoneDigits = digits(input.whatsapp);
  const docDigits = digits(input.document);
  if (!docDigits) throw new Error("Documento inválido.");
  if (input.documentType === "cpf" && !isValidCPF(docDigits)) {
    throw new Error("CPF inválido. Verifique os dados informados.");
  }
  if (!clean(input.uplineCoachId)) {
    throw new Error("Selecione um coach indicador para concluir o cadastro de parceiro.");
  }


  try {
    // 1) Garante profile (trigger handle_new_user já criou; upsert é idempotente)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          user_id: input.userId,
          name: input.name.trim(),
          email,
          role: "partner",
          phone: phoneDigits,
          status: "active",
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();
    if (profileError || !profile) {
      throw new Error(profileError?.message || "Não foi possível salvar o perfil.");
    }

    // 2) Insere/atualiza linha em partners (idempotente via onConflict)
    const nowIso = new Date().toISOString();
    const activationPatch = input.alreadyPartner
      ? {
          already_partner: true,
          activation_paid_at: nowIso,
          activation_source: "already_partner",
          activation_note: clean(input.activationNote),
        }
      : { already_partner: false };

    const { data: partner, error: partnerError } = await supabaseAdmin
      .from("partners")
      .upsert(
        {
          profile_id: profile.id,
          fantasy_name: input.fantasyName.trim(),
          document: docDigits,
          document_type: input.documentType,
          whatsapp: phoneDigits,
          city: clean(input.city),
          state: clean(input.state)?.toUpperCase() || null,
          business_area: clean(input.businessArea),
          specialty: clean(input.specialty),
          status: "pending",
          upline_coach_id: clean(input.uplineCoachId),
          ...activationPatch,
        },
        { onConflict: "profile_id" }
      )
      .select("id")
      .single();
    if (partnerError) throw new Error(partnerError.message);

    // Todo parceiro também precisa existir como aluno para acessar a loja/perfil do aluno.
    // Se o cadastro veio sem upline (caso de liberação/admin), usa o coach sistema como fallback.
    await ensureStudentForProfile(profile.id, input.uplineCoachId, partner?.id || null);

    return { ok: true, profileId: profile.id };
  } catch (err) {
    // Compensação: se algo falhou, remove profile órfão + auth user
    try {
      const { data: orphan } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, role")
        .eq("user_id", input.userId)
        .maybeSingle();
      if (orphan && orphan.role !== "admin") {
        const [{ count: partnerCount }, { count: coachCount }, { count: studentCount }] = await Promise.all([
          supabaseAdmin.from("partners").select("id", { count: "exact", head: true }).eq("profile_id", orphan.id),
          supabaseAdmin.from("coaches").select("id", { count: "exact", head: true }).eq("profile_id", orphan.id),
          supabaseAdmin.from("students").select("id", { count: "exact", head: true }).eq("profile_id", orphan.id),
        ]);
        if (!partnerCount && !coachCount && !studentCount) {
          await supabaseAdmin.from("profiles").delete().eq("id", orphan.id);
          await supabaseAdmin.auth.admin.deleteUser(orphan.user_id).catch(() => {});
        }
      }
    } catch {
      // best-effort
    }
    throw err;
  }
}

export type UpgradeExistingToProfessionalInput = {
  userId: string;
  uplineCoachId: string;
  specialtyKey: string;
  specialtyCustomDescription?: string | null;
  professionalCouncil?: string | null;
  councilNumber?: string | null;
  specialtyPendingSetup?: boolean;
  alreadyProfessional?: boolean;
  activationNote?: string | null;
};

export async function upgradeExistingToProfessional(input: UpgradeExistingToProfessionalInput) {
  // Localiza o profile do usuário autenticado pelo userId enviado.
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile?.id) throw new Error("Não encontramos seu perfil. Entre em contato com o suporte.");
  if (profile.role === "admin") throw new Error("Administradores não podem ser convertidos via cadastro público.");

  const nowIso = new Date().toISOString();
  const activationPatch = input.alreadyProfessional
    ? {
        already_coach: true,
        activation_paid_at: nowIso,
        activation_source: "already_professional" as const,
        activation_note: clean(input.activationNote),
      }
    : {};

  const professionalPatch = {
    is_professional: true,
    specialty_key: input.specialtyKey,
    specialty_custom_description: clean(input.specialtyCustomDescription),
    professional_council: clean(input.professionalCouncil),
    council_number: clean(input.councilNumber),
    specialty_pending_setup: !!input.specialtyPendingSetup,
    approved_at: nowIso,
    onboarding_stage: "released" as const,
    upline_coach_id: input.uplineCoachId,
  };

  const { data: existingCoach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingCoach?.id) {
    const { error: updErr } = await supabaseAdmin
      .from("coaches")
      .update({ ...professionalPatch, ...activationPatch })
      .eq("id", existingCoach.id);
    if (updErr) throw new Error(updErr.message);
  } else {
    let referralCode = makeReferralCode();
    let lastErr: { code?: string; message: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { error: insErr } = await supabaseAdmin.from("coaches").insert({
        profile_id: profile.id,
        referral_code: referralCode,
        referral_link: `/r/${referralCode}`,
        completed_coach_course: false,
        ...professionalPatch,
        ...activationPatch,
      });
      if (!insErr) { lastErr = null; break; }
      lastErr = insErr;
      if (insErr.code !== "23505") break;
      referralCode = makeReferralCode();
    }
    if (lastErr) throw new Error(lastErr.message);
  }

  await supabaseAdmin.from("profiles").update({ status: "active", role: "coach" }).eq("id", profile.id);
  await ensureStudentForProfile(profile.id, input.uplineCoachId);
  return { ok: true, profileId: profile.id };
}