import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertAdminProfile(userId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !profile || profile.role !== "admin") {
    throw new Error("Acesso negado");
  }

  return profile.id;
}

export async function confirmAuthEmailByProfileId(profileId: string) {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !profile?.user_id) {
    throw new Error("Perfil não encontrado para confirmar o e-mail.");
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(profile.user_id, {
    email_confirm: true,
  });

  if (authError) {
    throw new Error(`Não foi possível confirmar o e-mail${profile.email ? ` ${profile.email}` : ""}: ${authError.message}`);
  }

  return { ok: true, email: profile.email ?? null };
}

export async function notifyProfile(profileId: string | null | undefined, type: string, title: string, message: string, actionUrl: string) {
  if (!profileId) return;
  await supabaseAdmin.from("notifications").insert({
    profile_id: profileId,
    type,
    title,
    message,
    action_url: actionUrl,
  });
}