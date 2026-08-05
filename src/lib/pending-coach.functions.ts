import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PendingCoachStatus = {
  pending: boolean;
  studentId: string | null;
  profileId: string | null;
  name: string | null;
  missing: { phone: boolean; gender: boolean; birthdate: boolean };
};

/** Aluno recuperado automaticamente: precisa informar quem é o coach dele. */
export const getMyPendingCoachStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingCoachStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name, phone, gender, birthdate")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!profile?.id) {
      return { pending: false, studentId: null, profileId: null, name: null, missing: { phone: false, gender: false, birthdate: false } };
    }

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, coach_assignment_pending")
      .eq("profile_id", profile.id)
      .maybeSingle();

    const pending = !!(student as { coach_assignment_pending?: boolean } | null)?.coach_assignment_pending;

    return {
      pending,
      studentId: (student?.id as string) ?? null,
      profileId: profile.id as string,
      name: (profile.name as string) ?? null,
      missing: {
        phone: !profile.phone,
        gender: !profile.gender,
        birthdate: !profile.birthdate,
      },
    };
  });

/** Grava o coach informado pelo aluno e completa os dados que faltavam. */
export const submitMyPendingCoach = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        coachId: z.string().uuid(),
        phone: z.string().trim().min(10).max(20).optional(),
        gender: z.enum(["M", "F", "O"]).optional(),
        birthdate: z.string().min(8).max(10).optional(),
      })
      .parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) throw new Error("Perfil não encontrado.");

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("id", data.coachId)
      .maybeSingle();
    if (!coach?.id) throw new Error("Coach inválido. Selecione um coach da lista.");

    // Grava o coach ANTES do patch de perfil: a ficha de avaliação é criada por
    // trigger a partir do aluno, e precisa nascer já com o coach correto.
    const { data: studentRow, error } = await supabaseAdmin
      .from("students")
      .update({ coach_id: data.coachId, coach_assignment_pending: false } as never)
      .eq("profile_id", profile.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const patch: { phone?: string; gender?: string; birthdate?: string } = {};
    if (data.phone) patch.phone = data.phone.replace(/\D/g, "");
    if (data.gender) patch.gender = data.gender;
    if (data.birthdate) patch.birthdate = data.birthdate;
    if (Object.keys(patch).length) {
      await supabaseAdmin.from("profiles").update(patch).eq("id", profile.id);
    }

    // Garante que a ficha de avaliação reflita coach/gênero/nome atuais.
    if (studentRow?.id) {
      await supabaseAdmin.rpc("ensure_coach_evaluation_client_for_student" as never, { _student_id: studentRow.id } as never);
      await supabaseAdmin.rpc("sync_coach_evaluation_client_for_student" as never, { _student_id: studentRow.id } as never);
    }

    return { ok: true };
  });


export type PendingCoachStudentRow = {
  studentId: string;
  profileId: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
};

/** Lista para o admin os alunos recuperados que ainda não confirmaram o coach. */
export const adminListPendingCoachStudents = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingCoachStudentRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (me?.role !== "admin") throw new Error("Acesso negado");

    const { data } = await supabaseAdmin
      .from("students")
      .select("id, created_at, profile_id, profiles!students_profile_id_fkey(name, email, phone)")
      .eq("coach_assignment_pending" as never, true as never)
      .order("created_at", { ascending: false });

    return ((data || []) as Array<{
      id: string;
      created_at: string;
      profile_id: string;
      profiles?: { name?: string | null; email?: string | null; phone?: string | null } | null;
    }>).map((row) => ({
      studentId: row.id,
      profileId: row.profile_id,
      name: row.profiles?.name || "—",
      email: row.profiles?.email ?? null,
      phone: row.profiles?.phone ?? null,
      createdAt: row.created_at,
    }));
  });
