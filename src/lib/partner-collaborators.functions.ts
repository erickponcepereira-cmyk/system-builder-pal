import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PartnerCollaboratorRow = {
  id: string;
  created_at: string | null;
  profile: {
    name: string | null;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
  } | null;
};

type SupabaseLike = {
  from: (t: string) => any;
  rpc: (fn: string, args?: unknown) => Promise<{ error: unknown }>;
};

async function assertPartnerOwner(supabase: SupabaseLike, userId: string, partnerId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: partner } = await supabase
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!partner?.id) throw new Error("Acesso restrito ao dono do parceiro");
  return profile.id as string;
}

function mapRows(data: unknown): PartnerCollaboratorRow[] {
  return ((data as Array<{
    id: string;
    created_at: string | null;
    profiles: { name: string | null; email: string | null; phone: string | null; photo_url: string | null } | null;
  }>) || []).map((r) => ({ id: r.id, created_at: r.created_at, profile: r.profiles }));
}

export const listPartnerEligibleStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { partnerId: string }) => {
    if (!input?.partnerId) throw new Error("partnerId é obrigatório");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const profileId = await assertPartnerOwner(supabase as unknown as SupabaseLike, userId, data.partnerId);

    const { data: coaches } = await supabase
      .from("coaches")
      .select("id")
      .eq("profile_id", profileId);
    const coachIds = ((coaches as Array<{ id: string }>) || []).map((c) => c.id);
    if (coachIds.length === 0) return [] as PartnerCollaboratorRow[];

    const { data: rows, error } = await supabase
      .from("students")
      .select("id,created_at,profiles!students_profile_id_fkey(name,email,phone,photo_url)")
      .in("coach_id", coachIds)
      .is("partner_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return mapRows(rows);
  });

export const attachPartnerCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string; partnerId: string }) => {
    if (!input?.studentId || !input?.partnerId) throw new Error("Dados obrigatórios ausentes");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("link_partner_collaborator" as never, {
      _student_id: data.studentId,
      _partner_id: data.partnerId,
    } as never);
    if (error) throw error;
    return { ok: true };
  });

export const detachPartnerCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string; partnerId: string }) => {
    if (!input?.studentId || !input?.partnerId) throw new Error("Dados obrigatórios ausentes");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("unlink_partner_collaborator" as never, {
      _student_id: data.studentId,
      _partner_id: data.partnerId,
    } as never);
    if (error) throw error;
    return { ok: true };
  });
