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