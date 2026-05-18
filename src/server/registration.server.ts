import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

export async function finalizeRegistration(input: FinalizeRegistrationInput) {
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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: userId,
        name: input.name.trim(),
        email,
        role: input.role,
        phone: digits(input.phone),
        cpf: digits(input.cpf),
        birthdate: clean(input.birthdate),
        bio: clean(input.bio),
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
    throw new Error(profileError?.message || "Não foi possível salvar o perfil.");
  }

  if (input.role === "coach") {
    if (!input.coach?.uplineCoachId) {
      throw new Error("Selecione um coach indicador para concluir o cadastro.");
    }

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
          is_professional: input.coach.isProfessional ?? false,
          specialty_key: clean(input.coach.specialtyKey),
          professional_council: clean(input.coach.professionalCouncil),
          council_number: clean(input.coach.councilNumber),
          specialty_pending_setup: (input.coach.specialtyKey || "").toLowerCase() === "other",
          // Coach NÃO é aprovado automaticamente — admin precisa liberar
          approved_at: null,
        },
        { onConflict: "profile_id" }
      );

      if (!coachError) {
        // Marca o profile como pendente até o admin aprovar
        await supabaseAdmin
          .from("profiles")
          .update({ status: "pending" })
          .eq("id", profile.id);

        // Cria registro de aluno para o coach (acesso ao app do aluno mesmo pendente)
        const { error: selfStudentError } = await supabaseAdmin.from("students").upsert(
          {
            profile_id: profile.id,
            coach_id: input.coach.uplineCoachId,
          },
          { onConflict: "profile_id" }
        );
        if (selfStudentError) throw new Error(selfStudentError.message);
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

  const { error: studentError } = await supabaseAdmin.from("students").upsert(
    {
      profile_id: profile.id,
      coach_id: input.student.coachId,
      referred_by_student_id: input.student.referredByStudentId || null,
      referral_code: clean(input.student.referralCode),
      partner_id: input.student.partnerId || null,
    },
    { onConflict: "profile_id" }
  );

  if (studentError) throw new Error(studentError.message);

  return { ok: true, profileId: profile.id, role: input.role };
}