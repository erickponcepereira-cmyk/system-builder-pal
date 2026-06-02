import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function resolveStudentByUser(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: student } = await supabaseAdmin
    .from("students").select("id, coach_id, gender, profile_id").eq("profile_id", profile.id).maybeSingle();
  return (student as { id: string; coach_id: string | null; gender: string | null; profile_id: string } | null) ?? null;
}

export type CurrentTurma = {
  competitionId: string;
  competitionLabel: string; // "Junho 2026"
  groupId: string;
  groupNumber: number;
  initialStart: string;
  initialEnd: string;
  finalWeighIn: string | null;
  awardDate: string | null;
};

export type ChallengeTokenSummary = {
  balance: number;
  totalEarned: number;
  totalConsumed: number;
  currentTurma: CurrentTurma | null;
  alreadyEnrolledInCurrent: boolean;
  // Próximas turmas em janela aberta de pesagem inicial onde o aluno NÃO está inscrito.
  joinableTurmas: CurrentTurma[];
};

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

async function loadJoinableTurmas(studentId: string): Promise<{ joinable: CurrentTurma[]; enrolledCompIds: Set<string> }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data: groups } = await supabaseAdmin
    .from("competition_groups")
    .select("id, group_number, initial_start_date, initial_end_date, final_weigh_in_date, award_date, competition:competition_id(id, month, year, status)")
    .lte("initial_start_date", today)
    .gte("initial_end_date", today);
  const list = ((groups as Array<{
    id: string; group_number: number; initial_start_date: string; initial_end_date: string;
    final_weigh_in_date: string | null; award_date: string | null;
    competition: { id: string; month: number; year: number; status: string } | null;
  }> | null) || []).filter((g) => g.competition && g.competition.status === "active");

  const { data: enrolls } = await supabaseAdmin
    .from("competition_enrollments").select("competition_id").eq("student_id", studentId);
  const enrolledCompIds = new Set(((enrolls as { competition_id: string }[] | null) || []).map((e) => e.competition_id));

  const joinable = list
    .filter((g) => g.competition && !enrolledCompIds.has(g.competition.id))
    .map((g) => ({
      competitionId: g.competition!.id,
      competitionLabel: `${MONTHS[g.competition!.month]} ${g.competition!.year}`,
      groupId: g.id,
      groupNumber: g.group_number,
      initialStart: g.initial_start_date,
      initialEnd: g.initial_end_date,
      finalWeighIn: g.final_weigh_in_date,
      awardDate: g.award_date,
    }));
  return { joinable, enrolledCompIds };
}

export const getMyChallengeTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeTokenSummary> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const student = await resolveStudentByUser(context.userId);
    if (!student) {
      return { balance: 0, totalEarned: 0, totalConsumed: 0, currentTurma: null, alreadyEnrolledInCurrent: false, joinableTurmas: [] };
    }
    const { data: tokens } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("id, consumed_at")
      .eq("student_id", student.id);
    const rows = ((tokens as { id: string; consumed_at: string | null }[] | null) || []);
    const totalEarned = rows.length;
    const totalConsumed = rows.filter((r) => !!r.consumed_at).length;
    const balance = totalEarned - totalConsumed;

    const { joinable, enrolledCompIds } = await loadJoinableTurmas(student.id);
    const currentTurma = joinable[0] || null;
    const alreadyEnrolledInCurrent = currentTurma ? enrolledCompIds.has(currentTurma.competitionId) : false;

    return { balance, totalEarned, totalConsumed, currentTurma, alreadyEnrolledInCurrent, joinableTurmas: joinable };
  });

export const joinChallengeWithToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ competitionId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; turma: CurrentTurma } | { ok: false; error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const student = await resolveStudentByUser(context.userId);
    if (!student) return { ok: false, error: "Aluno não encontrado." };
    if (!student.gender) return { ok: false, error: "Complete o seu perfil (gênero) antes de entrar no desafio." };

    // Token disponível?
    const { data: freeTokens } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("id")
      .eq("student_id", student.id)
      .is("consumed_at", null)
      .order("granted_at", { ascending: true })
      .limit(1);
    const token = ((freeTokens as { id: string }[] | null) || [])[0];
    if (!token) return { ok: false, error: "Você não possui moedas de desafio disponíveis." };

    const { joinable } = await loadJoinableTurmas(student.id);
    const target = data.competitionId
      ? joinable.find((t) => t.competitionId === data.competitionId)
      : joinable[0];
    if (!target) return { ok: false, error: "Nenhuma turma com janela de pesagem inicial aberta no momento, ou você já está inscrito." };

    if (!student.coach_id) return { ok: false, error: "Você precisa estar vinculado a um coach para entrar no desafio." };

    const { data: enrollment, error: enrollErr } = await supabaseAdmin
      .from("competition_enrollments")
      .insert({
        competition_id: target.competitionId,
        group_id: target.groupId,
        student_id: student.id,
        coach_id: student.coach_id,
        gender: student.gender,
        status: "enrolled",
        enrolled_by: "system",
      })
      .select("id")
      .single();
    if (enrollErr || !enrollment) {
      return { ok: false, error: enrollErr?.message || "Falha ao criar inscrição." };
    }

    const { error: tokErr } = await supabaseAdmin
      .from("student_challenge_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_competition_id: target.competitionId,
        consumed_enrollment_id: (enrollment as { id: string }).id,
      })
      .eq("id", token.id);
    if (tokErr) {
      // melhor esforço: tenta reverter a inscrição
      await supabaseAdmin.from("competition_enrollments").delete().eq("id", (enrollment as { id: string }).id);
      return { ok: false, error: "Falha ao consumir a moeda. Tente novamente." };
    }

    return { ok: true, turma: target };
  });

export type CoachStudentTokenBalance = { studentId: string; balance: number; totalEarned: number };

export const getCoachStudentsTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ studentIds: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data }): Promise<CoachStudentTokenBalance[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tokens } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("student_id, consumed_at")
      .in("student_id", data.studentIds);
    const map = new Map<string, { earned: number; consumed: number }>();
    ((tokens as { student_id: string; consumed_at: string | null }[] | null) || []).forEach((t) => {
      const cur = map.get(t.student_id) || { earned: 0, consumed: 0 };
      cur.earned += 1;
      if (t.consumed_at) cur.consumed += 1;
      map.set(t.student_id, cur);
    });
    return data.studentIds.map((id) => {
      const c = map.get(id) || { earned: 0, consumed: 0 };
      return { studentId: id, balance: c.earned - c.consumed, totalEarned: c.earned };
    });
  });
