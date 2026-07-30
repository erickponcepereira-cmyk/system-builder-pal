import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SponsorContact = {
  /** Nome do coach patrocinador (ou null quando não há). */
  name: string | null;
  /** Telefone/WhatsApp do patrocinador, só dígitos ou formatado. */
  phone: string | null;
  /** Primeiro nome de quem está logado — usado na mensagem do WhatsApp. */
  myName: string | null;
};

/**
 * Resolve o coach patrocinador de quem está logado.
 *
 * Ordem: linha de aluno (`students.coach_id`, que existe para praticamente
 * todo mundo, inclusive coach/parceiro/profissional) → `coaches.upline_coach_id`
 * → `partners.upline_coach_id`.
 */
export const getMySponsorContact = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<SponsorContact> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!profile?.id) return { name: null, phone: null, myName: null };
    const myName = (profile.name as string) || null;

    let coachId: string | null = null;

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("coach_id")
      .eq("profile_id", profile.id)
      .not("coach_id", "is", null)
      .limit(1)
      .maybeSingle();
    coachId = (student?.coach_id as string) ?? null;

    if (!coachId) {
      const { data: coach } = await supabaseAdmin
        .from("coaches")
        .select("upline_coach_id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      coachId = (coach?.upline_coach_id as string) ?? null;
    }

    if (!coachId) {
      const { data: partner } = await supabaseAdmin
        .from("partners")
        .select("upline_coach_id")
        .eq("profile_id", profile.id)
        .not("upline_coach_id", "is", null)
        .limit(1)
        .maybeSingle();
      coachId = (partner?.upline_coach_id as string) ?? null;
    }

    if (!coachId) return { name: null, phone: null, myName };

    const { data: sponsorCoach } = await supabaseAdmin
      .from("coaches")
      .select("profile_id")
      .eq("id", coachId)
      .maybeSingle();

    if (!sponsorCoach?.profile_id) return { name: null, phone: null, myName };

    const { data: sponsorProfile } = await supabaseAdmin
      .from("profiles")
      .select("name, phone")
      .eq("id", sponsorCoach.profile_id as string)
      .maybeSingle();

    return {
      name: (sponsorProfile?.name as string) || null,
      phone: (sponsorProfile?.phone as string) || null,
      myName,
    };
  });
