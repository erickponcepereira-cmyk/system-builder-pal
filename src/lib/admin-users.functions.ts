import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const adminDeleteUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ userId: uuid }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);

    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir o próprio cadastro.");
    }

    // 1) Clean dependents (RLS-scoped via the user's session client is fine,
    //    function is SECURITY DEFINER but checks admin role internally).
    const { error: purgeError } = await context.supabase.rpc(
      "admin_purge_user_dependents" as never,
      { _user_id: data.userId } as never,
    );
    if (purgeError) throw new Error("Falha ao limpar dependências: " + purgeError.message);

    // 2) Delete the auth user — cascades to profiles/students/coaches.
    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error("Falha ao remover usuário: " + delErr.message);

    return { ok: true };
  });

export const approveCoachAndConfirmEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ coachId: uuid }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { assertAdminProfile, confirmAuthEmailByProfileId, notifyProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminProfileId = await assertAdminProfile(context.userId);

    const { data: coach, error: coachError } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .eq("id", data.coachId)
      .maybeSingle();

    if (coachError || !coach) {
      throw new Error("Coach não encontrado.");
    }

    await confirmAuthEmailByProfileId(coach.profile_id);

    const now = new Date().toISOString();
    const { error: updateCoachError } = await supabaseAdmin
      .from("coaches")
      .update({ approved_at: now, approved_by: adminProfileId, onboarding_stage: "released" })
      .eq("id", coach.id);
    if (updateCoachError) throw new Error("Falha ao aprovar coach: " + updateCoachError.message);

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", coach.profile_id);
    if (profileError) throw new Error("Falha ao ativar perfil: " + profileError.message);

    await notifyProfile(
      coach.profile_id,
      "coach_approved",
      "Cadastro de coach aprovado! 🎉",
      "Seu e-mail foi confirmado e seu painel de coach foi liberado.",
      "/coach",
    );

    return { ok: true };
  });
