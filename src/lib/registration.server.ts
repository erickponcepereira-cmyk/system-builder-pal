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

/**
 * Coach responsável definitivo da conta. Uma vez vinculado (como aluno,
 * coach/profissional ou parceiro), o vínculo não muda em novos perfis.
 */
export async function resolveBoundCoachId(profileId: string): Promise<string | null> {
  const { data: student } = await supabaseAdmin
    .from("students")
    .select("coach_id, coach_assignment_pending")
    .eq("profile_id", profileId)
    .maybeSingle();
  const studentRow = student as { coach_id?: string | null; coach_assignment_pending?: boolean | null } | null;
  if (studentRow?.coach_id && studentRow.coach_assignment_pending === false) return studentRow.coach_id;

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("upline_coach_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (coach?.upline_coach_id) return coach.upline_coach_id;

  const { data: partner } = await supabaseAdmin
    .from("partners")
    .select("upline_coach_id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (partner?.upline_coach_id) return partner.upline_coach_id;

  return studentRow?.coach_id ?? null;
}

export async function getBoundCoachForUser(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) return { coachId: null as string | null, coachName: null as string | null };

  const coachId = await resolveBoundCoachId(profile.id);
  if (!coachId) return { coachId: null as string | null, coachName: null as string | null };

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id, profile_id, profiles:profile_id(name)")
    .eq("id", coachId)
    .maybeSingle();
  // Nunca devolve o próprio usuário como coach responsável.
  if (!coach?.id || coach.profile_id === profile.id) {
    return { coachId: null as string | null, coachName: null as string | null };
  }
  const name = (coach as { profiles?: { name?: string | null } | null }).profiles?.name ?? null;
  return { coachId, coachName: name };
}

export async function ensureStudentForProfile(
  profileId: string,
  preferredCoachId?: string | null,
  partnerId?: string | null,
  referredByStudentId?: string | null,
) {
  const coachId = clean(preferredCoachId);
  if (!coachId) {
    throw new Error("Selecione um coach responsável para concluir o cadastro.");
  }
  const { data: selectedCoach } = await supabaseAdmin
    .from("coaches")
    .select("id, profile_id, approved_at, blocked_at")
    .eq("id", coachId)
    .maybeSingle();
  if (!selectedCoach?.id || !selectedCoach.approved_at || selectedCoach.blocked_at) {
    throw new Error("O coach selecionado não está ativo.");
  }
  if (selectedCoach.profile_id === profileId) {
    throw new Error("Você não pode selecionar a si próprio como coach responsável.");
  }

  const { data: existing } = await supabaseAdmin
    .from("students")
    .select("id, coach_assignment_pending")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing?.id) {
    if (existing.coach_assignment_pending !== false) {
      const { error } = await supabaseAdmin
        .from("students")
        .update({
          coach_id: coachId,
          referred_by_student_id: clean(referredByStudentId),
          partner_id: clean(partnerId),
          coach_assignment_pending: false,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return existing.id;
  }

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
        referred_by_student_id: clean(referredByStudentId),
        coach_assignment_pending: false,
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

async function resolveStudentReferral(input: NonNullable<FinalizeRegistrationInput["student"]>) {
  const code = clean(input.referralCode);
  if (!code) return input;
  const { data } = await supabaseAdmin.rpc("validate_referral_code" as never, { _code: code } as never);
  const row = (Array.isArray(data) ? data[0] : null) as {
    valid?: boolean;
    coach_id?: string | null;
    referred_by_student_id?: string | null;
    partner_id?: string | null;
  } | null;
  if (!row?.valid || !row.coach_id) {
    throw new Error("O link de indicação não é mais válido. Abra novamente o link enviado pelo seu coach.");
  }
  return {
    ...input,
    coachId: row.coach_id,
    referredByStudentId: row.referred_by_student_id ?? null,
    partnerId: row.partner_id ?? null,
  };
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
      .is("merged_into_profile_id", null)
      .neq("user_id", userId)
      .maybeSingle();
    if (cpfClash) {
      throw new Error("Já existe uma conta cadastrada com este CPF. Entre com a conta existente ou fale com o suporte.");
    }
  }

  // Telefone duplicado normalmente indica cadastro repetido da mesma pessoa.
  const phoneDigits = digits(input.phone);
  if (phoneDigits && phoneDigits.length >= 10) {
    const { data: phoneClash } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phoneDigits)
      .is("merged_into_profile_id", null)
      .neq("user_id", userId)
      .maybeSingle();
    if (phoneClash) {
      throw new Error("Já existe uma conta cadastrada com este telefone. Entre com a conta existente ou fale com o suporte.");
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
    // Profissional (novo ou já-coach) NUNCA é auto-aprovado: sempre passa
    // pela aba "Liberar Profissionais" (confirmar e-mail → isentar/cobrar
    // anuidade → aprovar). Auto-aprovação só vale para coach comum que marcou
    // "já sou coach FitMind".
    const coachApprovedAt = isAlreadyCoach && !isProfessional ? new Date().toISOString() : null;
    const activationPatch = isAlreadyCoach
      ? {
          already_coach: true,
          // Só registra ativação paga automaticamente para coach comum já-coach.
          // Profissional passa pelo admin para isentar/cobrar anuidade.
          ...(isProfessional
            ? {}
            : {
                activation_paid_at: new Date().toISOString(),
                activation_source: "already_coach",
              }),
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
          onboarding_stage: coachApprovedAt ? "released" : (isProfessional ? "awaiting_admin" : "awaiting_payment"),
          ...activationPatch,
        },
        { onConflict: "profile_id" }
      );

      if (!coachError) {
        // Profissional já nasce com coach liberado; coach comum segue pendente até concluir o fluxo.
        await supabaseAdmin
          .from("profiles")
          .update({ status: coachApprovedAt ? "active" : "pending" })
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

  const studentInput = await resolveStudentReferral(input.student);

  await ensureStudentForProfile(
    profile.id,
    studentInput.coachId,
    studentInput.partnerId,
    studentInput.referredByStudentId,
  );

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
    const activationPatch: {
      already_partner: boolean;
      activation_paid_at?: string;
      activation_source?: string;
      activation_note?: string | null;
    } = input.alreadyPartner
      ? {
          already_partner: true,
          activation_paid_at: nowIso,
          activation_source: "already_partner",
          activation_note: clean(input.activationNote),
        }
      : { already_partner: false };


    const partnerPayload = {
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
    };

    // Multi-unidade: procura unidade existente do mesmo dono + mesmo documento
    const { data: existingPartner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("document", docDigits)
      .maybeSingle();

    let partner: { id: string } | null = null;
    let partnerError: { message: string } | null = null;
    if (existingPartner?.id) {
      const r = await supabaseAdmin
        .from("partners")
        .update(partnerPayload)
        .eq("id", existingPartner.id)
        .select("id")
        .single();
      partner = r.data;
      partnerError = r.error;
    } else {
      const r = await supabaseAdmin
        .from("partners")
        .insert(partnerPayload)
        .select("id")
        .single();
      partner = r.data;
      partnerError = r.error;
    }
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

  const boundCoachId = await resolveBoundCoachId(profile.id);
  const uplineCoachId = boundCoachId || clean(input.uplineCoachId);
  if (!uplineCoachId) throw new Error("Selecione um coach indicador para continuar.");

  const activationPatch = input.alreadyProfessional
    ? {
        already_coach: true,
        // Não marca ativação/aprovação automaticamente: profissional passa
        // pela aba admin "Liberar Profissionais" (confirmar e-mail →
        // isentar/cobrar anuidade → aprovar).
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
    approved_at: null as string | null,
    onboarding_stage: "awaiting_admin" as const,
    upline_coach_id: uplineCoachId,
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

  await supabaseAdmin.from("profiles").update({ status: "pending", role: "coach" }).eq("id", profile.id);
  await ensureStudentForProfile(profile.id, uplineCoachId);
  return { ok: true, profileId: profile.id };
}
export type UpgradeExistingToCoachInput = {
  userId: string;
  uplineCoachId: string;
  pixKey?: string | null;
  pixKeyType?: string | null;
  bankName?: string | null;
  bankAgency?: string | null;
  bankAccount?: string | null;
  bankAccountType?: string | null;
  completedCoachCourse?: boolean;
  coachCourseNotes?: string | null;
  alreadyCoach?: boolean;
  activationNote?: string | null;
};

/**
 * Converte uma conta JÁ EXISTENTE (aluno, parceiro, profissional) em coach,
 * sem criar novo usuário/perfil — evita contas duplicadas.
 */
export async function upgradeExistingToCoach(input: UpgradeExistingToCoachInput) {
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, role, status")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile?.id) throw new Error("Não encontramos seu perfil. Entre em contato com o suporte.");
  if (profile.role === "admin") throw new Error("Administradores não podem ser convertidos via cadastro público.");
  const boundCoachId = await resolveBoundCoachId(profile.id);
  const uplineCoachId = boundCoachId || clean(input.uplineCoachId);
  if (!uplineCoachId) throw new Error("Selecione um coach indicador para continuar.");

  const { data: existingCoach } = await supabaseAdmin
    .from("coaches")
    .select("id, is_professional, onboarding_stage")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (existingCoach?.id && !existingCoach.is_professional) {
    throw new Error("Sua conta já possui cadastro de coach.");
  }

  const nowIso = new Date().toISOString();
  const alreadyCoach = !!input.alreadyCoach;
  const approvedAt = alreadyCoach ? nowIso : null;
  const activationPatch = alreadyCoach
    ? {
        already_coach: true,
        activation_paid_at: nowIso,
        activation_source: "already_coach",
        activation_note: clean(input.activationNote),
      }
    : {};

  const coachPatch = {
    upline_coach_id: uplineCoachId,
    pix_key: clean(input.pixKey),
    pix_key_type: clean(input.pixKeyType),
    bank_name: clean(input.bankName),
    bank_agency: clean(input.bankAgency),
    bank_account: clean(input.bankAccount),
    bank_account_type: clean(input.bankAccountType),
    completed_coach_course: input.completedCoachCourse ?? false,
    coach_course_notes: clean(input.coachCourseNotes),
    approved_at: approvedAt,
    onboarding_stage: (approvedAt ? "released" : "awaiting_payment") as "released" | "awaiting_payment",
    ...activationPatch,
  };

  if (existingCoach?.id) {
    // Profissional virando também coach comum: mantém a linha existente.
    const { error: updErr } = await supabaseAdmin
      .from("coaches")
      .update(coachPatch)
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
        is_professional: false,
        ...coachPatch,
      });
      if (!insErr) { lastErr = null; break; }
      lastErr = insErr;
      if (insErr.code !== "23505") break;
      referralCode = makeReferralCode();
    }
    if (lastErr) throw new Error(lastErr.message);
  }

  // Nunca rebaixa contas já ativas — o painel de aluno continua liberado.
  await supabaseAdmin
    .from("profiles")
    .update({ role: "coach", status: profile.status === "active" ? "active" : "pending" })
    .eq("id", profile.id);

  await ensureStudentForProfile(profile.id, uplineCoachId);
  return { ok: true, profileId: profile.id };
}

export type UpgradeExistingToPartnerInput = {
  userId: string;
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

/**
 * Converte uma conta JÁ EXISTENTE em empresa parceira, mantendo o mesmo
 * profile (e o papel atual quando o usuário já é coach/profissional).
 */
export async function upgradeExistingToPartner(input: UpgradeExistingToPartnerInput) {
  const docDigits = digits(input.document);
  if (!docDigits) throw new Error("Documento inválido.");
  if (input.documentType === "cpf" && !isValidCPF(docDigits)) {
    throw new Error("CPF inválido. Verifique os dados informados.");
  }
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile?.id) throw new Error("Não encontramos seu perfil. Entre em contato com o suporte.");
  if (profile.role === "admin") throw new Error("Administradores não podem ser convertidos via cadastro público.");

  const boundCoachId = await resolveBoundCoachId(profile.id);
  const uplineCoachId = boundCoachId || clean(input.uplineCoachId);
  if (!uplineCoachId) throw new Error("Selecione um coach indicador para continuar.");

  const nowIso = new Date().toISOString();
  const activationPatch: {
    already_partner: boolean;
    activation_paid_at?: string;
    activation_source?: string;
    activation_note?: string | null;
  } = input.alreadyPartner
    ? {
        already_partner: true,
        activation_paid_at: nowIso,
        activation_source: "already_partner",
        activation_note: clean(input.activationNote),
      }
    : { already_partner: false };

  const partnerPayload = {
    profile_id: profile.id,
    fantasy_name: input.fantasyName.trim(),
    document: docDigits,
    document_type: input.documentType,
    whatsapp: digits(input.whatsapp),
    city: clean(input.city),
    state: clean(input.state)?.toUpperCase() || null,
    business_area: clean(input.businessArea),
    specialty: clean(input.specialty),
    status: "pending",
    upline_coach_id: uplineCoachId,
    ...activationPatch,
  };

  const { data: existingPartner } = await supabaseAdmin
    .from("partners")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("document", docDigits)
    .maybeSingle();

  let partnerId: string | null = null;
  if (existingPartner?.id) {
    const { data, error } = await supabaseAdmin
      .from("partners").update(partnerPayload).eq("id", existingPartner.id).select("id").single();
    if (error) throw new Error(error.message);
    partnerId = data?.id ?? null;
  } else {
    const { data, error } = await supabaseAdmin
      .from("partners").insert(partnerPayload).select("id").single();
    if (error) throw new Error(error.message);
    partnerId = data?.id ?? null;
  }

  // Só promove o papel quando a conta ainda é de aluno — coach/profissional mantém o painel atual.
  if (profile.role === "student") {
    await supabaseAdmin.from("profiles").update({ role: "partner" }).eq("id", profile.id);
  }

  await ensureStudentForProfile(profile.id, uplineCoachId, partnerId);
  return { ok: true, profileId: profile.id, partnerId };
}
