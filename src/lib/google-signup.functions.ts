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

    // 1) Já tem profile vinculado a este user_id?
    const { data: own } = await supabaseAdmin
      .from("profiles")
      .select("id, role, name, must_reset_password")
      .eq("user_id", userId)
      .maybeSingle();

    if (own) {
      return {
        status: "ready",
        profileId: own.id as string,
        role: (own.role as string) ?? null,
        name: (own.name as string) ?? null,
        email,
        mustResetPassword: !!(own as { must_reset_password?: boolean }).must_reset_password,
      };
    }

    // 2) Existe profile com o mesmo e-mail (cadastro antigo)? Vincula em vez de duplicar.
    if (email) {
      const { data: byEmail } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, role, name, must_reset_password")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();

      if (byEmail) {
        const existingUserId = byEmail.user_id as string | null;
        if (!existingUserId || existingUserId === userId) {
          await supabaseAdmin.from("profiles").update({ user_id: userId }).eq("id", byEmail.id);
        }
        return {
          status: "linked",
          profileId: byEmail.id as string,
          role: (byEmail.role as string) ?? null,
          name: (byEmail.name as string) ?? null,
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
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { finalizeRegistration } = await import("./registration.server");

    const userId = context.userId;
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (authUser?.user?.email || "").trim().toLowerCase();
    if (!email) throw new Error("Conta Google sem e-mail. Não foi possível concluir o cadastro.");

    // Blindagem: se já existe profile (por user_id ou e-mail), não cria outro.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id")
      .or(`user_id.eq.${userId},email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (!existing.user_id) {
        await supabaseAdmin.from("profiles").update({ user_id: userId }).eq("id", existing.id);
      }
      await supabaseAdmin
        .from("profiles")
        .update({ phone: data.phone, gender: data.gender, birthdate: data.birthdate })
        .eq("id", existing.id);
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
        coachId: data.coachId,
        referredByStudentId: data.referredByStudentId ?? null,
        referralCode: data.referralCode ?? null,
        partnerId: data.partnerId ?? null,
      },
    } as never);

    // Garante gravação de sexo e nascimento mesmo que finalizeRegistration ignore campos.
    await supabaseAdmin
      .from("profiles")
      .update({ phone: data.phone, gender: data.gender, birthdate: data.birthdate })
      .eq("user_id", userId);

    return { ok: true, alreadyExisted: false };
  });
