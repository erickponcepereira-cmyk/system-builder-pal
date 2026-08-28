import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Quem pode agir na academia: dono da unidade, membro da equipe, ou master
 * admin para suporte. Devolve o profile_id de quem passou, ou null.
 *
 * A ordem importa: master admin é um OU, não um pré-requisito. Enquanto
 * `is_master_admin` era exigido ANTES de olhar o vínculo — o gate da fase de
 * teste — a pessoa enxergava a academia na tela e levava "Sem acesso." em
 * cada clique, porque quem lista aprendeu sobre membro e quem age não.
 */
export async function perfilComAcessoAcademia(
  userId: string,
  partnerId: string,
): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, is_master_admin")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return null;
  const profileId = (profile as { id: string }).id;

  const [{ data: membro }, { data: dono }] = await Promise.all([
    supabaseAdmin.from("partner_members").select("id").eq("partner_id", partnerId).eq("profile_id", profileId).maybeSingle(),
    supabaseAdmin.from("partners").select("id").eq("id", partnerId).eq("profile_id", profileId).maybeSingle(),
  ]);

  const master = Boolean((profile as { is_master_admin?: boolean }).is_master_admin);
  if (!membro && !dono && !master) return null;

  return profileId;
}
