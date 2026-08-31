import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GoogleAccountState = {
  /** Perfil já existe e está pronto para uso. */
  status: "ready" | "linked" | "needs_profile";
  profileId: string | null;
  role: string | null;
  name: string | null;
  email: string | null;
  mustResetPassword: boolean;
};

/**
 * Resolve o estado da conta logada via Google:
 *  - "ready": já existe profile para este user_id.
 *  - "linked": existia um profile com o MESMO e-mail sem user_id (ou órfão);
 *              vinculamos ao usuário atual em vez de criar um cadastro duplicado.
 *  - "needs_profile": conta nova, precisa completar o cadastro.
 *
 * Blindagem contra duplicidade: nunca cria um segundo profile para o mesmo e-mail.
 */
export const resolveGoogleAccount = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleAccountState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const userId = context.userId;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (authUser?.user?.email || "").trim().toLowerCase();
    const metaName =
      (authUser?.user?.user_metadata?.full_name as string) ||
      (authUser?.user?.user_metadata?.name as string) ||
      null;

    // Um trigger cria o profile automaticamente ao criar o usuário no Google.
    // Por isso "ter profile" NÃO significa cadastro completo: para aluno é
    // preciso existir a linha em `students` + telefone/sexo/nascimento.
    const isStudentComplete = async (profile: {
      id: string;
      role?: string | null;
      phone?: string | null;
      gender?: string | null;
      birthdate?: string | null;
    }) => {
      const role = profile.role ?? "student";
      if (role !== "student") return true; // coach/partner/professional/admin têm fluxo próprio
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("id, coach_assignment_pending")
        .eq("profile_id", profile.id)
        .maybeSingle();
      return !!student?.id
        && student.coach_assignment_pending === false
        && !!profile.phone
        && !!profile.gender
        && !!profile.birthdate;
    };

    // 1) Já tem profile vinculado a este user_id?
    const { data: own } = await supabaseAdmin
      .from("profiles")
      .select("id, role, name, phone, gender, birthdate, must_reset_password")
      .eq("user_id", userId)
      .maybeSingle();

    if (own) {
      const complete = await isStudentComplete(own as never);
      return {
        status: complete ? "ready" : "needs_profile",
        profileId: own.id as string,
        role: (own.role as string) ?? null,
        name: ((own.name as string) || metaName) ?? null,
        email,
        mustResetPassword: !!(own as { must_reset_password?: boolean }).must_reset_password,
      };
    }

    // 2) Existe profile com o mesmo e-mail (cadastro antigo)? Vincula em vez de duplicar.
    if (email) {
      const { data: byEmail } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, role, name, phone, gender, birthdate, must_reset_password")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();

      if (byEmail) {
        const existingUserId = byEmail.user_id as string | null;
        if (!existingUserId || existingUserId === userId) {
          await supabaseAdmin.from("profiles").update({ user_id: userId }).eq("id", byEmail.id);
        }
        const complete = await isStudentComplete(byEmail as never);
        return {
          status: complete ? "linked" : "needs_profile",
          profileId: byEmail.id as string,
          role: (byEmail.role as string) ?? null,
          name: ((byEmail.name as string) || metaName) ?? null,
          email,
          mustResetPassword: !!(byEmail as { must_reset_password?: boolean }).must_reset_password,
        };
      }
    }


    return {
      status: "needs_profile",
      profileId: null,
      role: null,
      name: metaName,
      email,
      mustResetPassword: false,
    };
  });

/** Completa o cadastro de aluno criado via Google (telefone, sexo e nascimento obrigatórios). */
export const completeGoogleStudentSignup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(10).max(20),
        gender: z.enum(["M", "F", "O"]),
        birthdate: z.string().min(8).max(10),
        coachId: z.string().uuid(),
        referredByStudentId: z.string().uuid().nullable().optional(),
        referralCode: z.string().nullable().optional(),
        partnerId: z.string().uuid().nullable().optional(),
        touchId: z.string().uuid().nullable().optional(),
      })
      .refine((v) => !v.name.includes("@"), {
        message: "Informe seu nome completo (não use o e-mail).",
        path: ["name"],
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { finalizeRegistration, ensureStudentForProfile } = await import("./registration.server");

    const userId = context.userId;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (authUser?.user?.email || "").trim().toLowerCase();
    if (!email) throw new Error("Conta Google sem e-mail. Não foi possível concluir o cadastro.");

    // Rede de segurança: o código de indicação manda. Se o link trouxe um
    // código válido, o coach vem do banco — nunca do que a tela enviou.
    let coachId = data.coachId;
    let referredByStudentId = data.referredByStudentId ?? null;
    let partnerId = data.partnerId ?? null;
    if (data.referralCode) {
      const { data: rows } = await supabaseAdmin.rpc(
        "validate_referral_code" as never,
        { _code: data.referralCode } as never,
      );
      const row = (Array.isArray(rows) ? (rows[0] as {
        valid: boolean;
        sponsor_name: string | null;
        coach_id: string | null;
        referred_by_student_id: string | null;
        partner_id: string | null;
      } | undefined) : undefined);
      if (!row?.valid || !row.coach_id) {
        throw new Error("O link de indicação não é mais válido. Abra novamente o link enviado pelo seu coach.");
      }
      coachId = row.coach_id;
      referredByStudentId = row.referred_by_student_id ?? null;
      partnerId = row.partner_id ?? null;
    }

    // Sem código na tela (storage perdido no meio do OAuth): o toque gravado
    // no servidor quando a pessoa abriu o link é a prova de origem.
    let touchCoachId: string | null = null;
    if (data.touchId) {
      const { data: toque } = await supabaseAdmin
        .from("referral_touches")
        .select("coach_id, partner_id, referred_by_student_id, claimed_profile_id")
        .eq("id", data.touchId)
        .maybeSingle();
      const t = toque as {
        coach_id: string | null;
        partner_id: string | null;
        referred_by_student_id: string | null;
        claimed_profile_id: string | null;
      } | null;
      if (t?.coach_id && !t.claimed_profile_id) {
        touchCoachId = t.coach_id;
        if (!data.referralCode) {
          coachId = t.coach_id;
          referredByStudentId = t.referred_by_student_id ?? referredByStudentId;
          partnerId = t.partner_id ?? partnerId;
        }
      }
    }


    // Blindagem: se já existe profile (por user_id ou e-mail), não cria outro —
    // apenas completa os dados e garante a linha de aluno.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, role")
      .or(`user_id.eq.${userId},email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("profiles")
        .update({
          user_id: existing.user_id || userId,
          name: data.name,
          email,
          phone: data.phone,
          gender: data.gender,
          birthdate: data.birthdate,
        })
        .eq("id", existing.id);

      if (!existing.role || existing.role === "student") {
        await ensureStudentForProfile(existing.id as string, coachId, partnerId, referredByStudentId);
      }
      await claimTouch(supabaseAdmin, data.touchId ?? null, existing.id as string, coachId, touchCoachId);
      return { ok: true, alreadyExisted: true };
    }


    await finalizeRegistration({
      userId,
      role: "student",
      name: data.name,
      email,
      phone: data.phone,
      gender: data.gender,
      birthdate: data.birthdate,
      student: {
        coachId,
        referredByStudentId,
        referralCode: data.referralCode ?? null,
        partnerId,
      },

    } as never);

    // Garante gravação de sexo e nascimento mesmo que finalizeRegistration ignore campos.
    await supabaseAdmin
      .from("profiles")
      .update({ phone: data.phone, gender: data.gender, birthdate: data.birthdate })
      .eq("user_id", userId);

    const { data: created } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    await claimTouch(supabaseAdmin, data.touchId ?? null, (created?.id as string) ?? null, coachId, touchCoachId);

    return { ok: true, alreadyExisted: false };
  });

/**
 * Marca o toque de indicação como usado por este perfil e registra quando o
 * coach gravado diverge do coach do link — é o que alimenta o alerta do admin.
 */
async function claimTouch(
  supabaseAdmin: { from: (t: string) => any },
  touchId: string | null,
  profileId: string | null,
  coachIdGravado: string | null,
  coachIdDoLink: string | null,
) {
  if (!touchId || !profileId) return;
  try {
    await supabaseAdmin
      .from("referral_touches")
      .update({ claimed_profile_id: profileId, claimed_at: new Date().toISOString() })
      .eq("id", touchId)
      .is("claimed_profile_id", null);
    if (coachIdDoLink && coachIdGravado && coachIdDoLink !== coachIdGravado) {
      console.error("[indicacao] divergencia de coach", { touchId, profileId, coachIdDoLink, coachIdGravado });
    }
  } catch (e) {
    console.error("[indicacao] falha ao vincular toque", e);
  }
}
