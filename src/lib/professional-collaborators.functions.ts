import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CollaboratorRow = {
  id: string;
  created_at: string | null;
  profile: {
    name: string | null;
    email: string | null;
    phone: string | null;
    photo_url: string | null;
  } | null;
};

async function resolveProfessionalCoachId(
  supabase: NonNullable<Parameters<Parameters<typeof createServerFn>[0] extends never ? never : never>[0]> | any,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: coach } = await supabase
    .from("coaches")
    .select("id,is_professional")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id || !coach.is_professional) {
    throw new Error("Acesso restrito a profissionais");
  }
  return coach.id as string;
}

export const listProfessionalCollaborators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const coachId = await resolveProfessionalCoachId(supabase, userId);
    const { data, error } = await supabase
      .from("students")
      .select("id,created_at,profiles!students_profile_id_fkey(name,email,phone,photo_url)")
      .eq("professional_coach_id", coachId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows: CollaboratorRow[] = ((data as unknown as Array<{
      id: string;
      created_at: string | null;
      profiles: { name: string | null; email: string | null; phone: string | null; photo_url: string | null } | null;
    }>) || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      profile: r.profiles,
    }));
    return rows;
  });

export const listEligibleStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const coachId = await resolveProfessionalCoachId(supabase, userId);
    const { data, error } = await supabase
      .from("students")
      .select("id,created_at,professional_coach_id,profiles!students_profile_id_fkey(name,email,phone,photo_url)")
      .eq("coach_id", coachId)
      .is("professional_coach_id", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows: CollaboratorRow[] = ((data as unknown as Array<{
      id: string;
      created_at: string | null;
      profiles: { name: string | null; email: string | null; phone: string | null; photo_url: string | null } | null;
    }>) || []).map((r) => ({
      id: r.id,
      created_at: r.created_at,
      profile: r.profiles,
    }));
    return rows;
  });

export const attachProfessionalCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string }) => {
    if (!input?.studentId) throw new Error("studentId é obrigatório");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("link_professional_collaborator" as never, {
      _student_id: data.studentId,
    } as never);
    if (error) throw error;
    return { ok: true };
  });

export const detachProfessionalCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string }) => {
    if (!input?.studentId) throw new Error("studentId é obrigatório");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("unlink_professional_collaborator" as never, {
      _student_id: data.studentId,
    } as never);
    if (error) throw error;
    return { ok: true };
  });
