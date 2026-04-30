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
  };
  student?: {
    coachId: string;
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

  if (userError || !userData.user) {
    throw new Error("Conta de acesso não encontrada. Tente criar a conta novamente.");
  }

  if ((userData.user.email || "").toLowerCase() !== email) {
    throw new Error("O e-mail da conta não confere com o cadastro informado.");
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existingProfile?.role === "admin") {
    throw new Error("Este usuário não pode ser alterado pelo cadastro público.");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        user_id: input.userId,
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
          approved_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" }
      );

      if (!coachError) return { ok: true, profileId: profile.id, role: input.role };
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
    },
    { onConflict: "profile_id" }
  );

  if (studentError) throw new Error(studentError.message);

  return { ok: true, profileId: profile.id, role: input.role };
}