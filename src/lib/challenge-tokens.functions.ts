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

    const logAttempt = async (params: {
      studentId: string | null;
      success: boolean;
      errorCode?: string;
      errorMessage?: string;
      competitionId?: string | null;
      groupId?: string | null;
      tokenId?: string | null;
      enrollmentId?: string | null;
    }) => {
      try {
        await supabaseAdmin.from("challenge_token_attempts").insert({
          student_id: params.studentId,
          user_id: context.userId,
          success: params.success,
          error_code: params.errorCode || null,
          error_message: params.errorMessage || null,
          competition_id: params.competitionId || null,
          group_id: params.groupId || null,
          token_id: params.tokenId || null,
          enrollment_id: params.enrollmentId || null,
        } as never);
      } catch (e) {
        console.warn("Falha ao registrar tentativa de moeda:", e);
      }
    };

    const student = await resolveStudentByUser(context.userId);
    if (!student) {
      await logAttempt({ studentId: null, success: false, errorCode: "student_not_found", errorMessage: "Aluno não encontrado." });
      return { ok: false, error: "Aluno não encontrado." };
    }
    if (!student.gender) {
      await logAttempt({ studentId: student.id, success: false, errorCode: "missing_gender", errorMessage: "Gênero ausente no perfil." });
      return { ok: false, error: "Complete o seu perfil (gênero) antes de entrar no desafio." };
    }

    const { data: freeTokens } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("id")
      .eq("student_id", student.id)
      .is("consumed_at", null)
      .order("granted_at", { ascending: true })
      .limit(1);
    const token = ((freeTokens as { id: string }[] | null) || [])[0];
    if (!token) {
      await logAttempt({ studentId: student.id, success: false, errorCode: "no_tokens", errorMessage: "Sem moedas disponíveis." });
      return { ok: false, error: "Você não possui moedas de desafio disponíveis." };
    }

    const { joinable } = await loadJoinableTurmas(student.id);
    const target = data.competitionId
      ? joinable.find((t) => t.competitionId === data.competitionId)
      : joinable[0];
    if (!target) {
      await logAttempt({
        studentId: student.id, success: false,
        errorCode: "no_open_turma",
        errorMessage: "Nenhuma turma com janela aberta ou aluno já inscrito.",
        competitionId: data.competitionId || null,
        tokenId: token.id,
      });
      return { ok: false, error: "Nenhuma turma com janela de pesagem inicial aberta no momento, ou você já está inscrito." };
    }

    if (!student.coach_id) {
      await logAttempt({
        studentId: student.id, success: false,
        errorCode: "no_coach",
        errorMessage: "Aluno sem coach vinculado.",
        competitionId: target.competitionId, groupId: target.groupId, tokenId: token.id,
      });
      return { ok: false, error: "Você precisa estar vinculado a um coach para entrar no desafio." };
    }

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
      await logAttempt({
        studentId: student.id, success: false,
        errorCode: "enrollment_failed",
        errorMessage: enrollErr?.message || "Falha ao criar inscrição.",
        competitionId: target.competitionId, groupId: target.groupId, tokenId: token.id,
      });
      return { ok: false, error: enrollErr?.message || "Falha ao criar inscrição." };
    }

    const enrollmentId = (enrollment as { id: string }).id;

    const { error: tokErr } = await supabaseAdmin
      .from("student_challenge_tokens")
      .update({
        consumed_at: new Date().toISOString(),
        consumed_competition_id: target.competitionId,
        consumed_enrollment_id: enrollmentId,
      })
      .eq("id", token.id);
    if (tokErr) {
      await supabaseAdmin.from("competition_enrollments").delete().eq("id", enrollmentId);
      await logAttempt({
        studentId: student.id, success: false,
        errorCode: "token_consume_failed",
        errorMessage: tokErr.message || "Falha ao consumir a moeda.",
        competitionId: target.competitionId, groupId: target.groupId, tokenId: token.id,
      });
      return { ok: false, error: "Falha ao consumir a moeda. Tente novamente." };
    }

    await logAttempt({
      studentId: student.id, success: true,
      competitionId: target.competitionId, groupId: target.groupId,
      tokenId: token.id, enrollmentId,
    });

    // Notifica o coach (best-effort)
    try {
      const { data: coachRow } = await supabaseAdmin
        .from("coaches").select("profile_id").eq("id", student.coach_id).maybeSingle();
      const coachProfileId = (coachRow as { profile_id: string } | null)?.profile_id;
      if (coachProfileId) {
        const { data: studentProf } = await supabaseAdmin
          .from("profiles").select("name").eq("id", student.profile_id).maybeSingle();
        const studentName = (studentProf as { name: string } | null)?.name || "Aluno";
        await supabaseAdmin.from("notifications").insert({
          profile_id: coachProfileId,
          type: "challenge_enrollment",
          title: "🏋️ Novo aluno no desafio",
          message: `${studentName} entrou em ${target.competitionLabel} — Turma ${target.groupNumber} usando moeda de desafio.`,
          action_url: "/coach",
        } as never);
      }
    } catch (e) {
      console.warn("Falha ao notificar coach sobre entrada no desafio:", e);
    }

    return { ok: true, turma: target };
  });

// ─── Histórico detalhado de moedas (aluno) ─────────────────────────────────
export type ChallengeTokenHistoryEntry = {
  id: string;
  grantedAt: string;
  consumedAt: string | null;
  sourceTransactionId: string | null;
  competitionId: string | null;
  competitionLabel: string | null;
  enrollmentId: string | null;
};

export const getMyChallengeTokenHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChallengeTokenHistoryEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const student = await resolveStudentByUser(context.userId);
    if (!student) return [];
    const { data: rows } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("id, granted_at, consumed_at, source_transaction_id, consumed_competition_id, consumed_enrollment_id")
      .eq("student_id", student.id)
      .order("granted_at", { ascending: false });
    const list = ((rows as Array<{
      id: string; granted_at: string; consumed_at: string | null;
      source_transaction_id: string | null;
      consumed_competition_id: string | null; consumed_enrollment_id: string | null;
    }> | null) || []);
    const compIds = Array.from(new Set(list.map((r) => r.consumed_competition_id).filter(Boolean) as string[]));
    let compMap = new Map<string, string>();
    if (compIds.length > 0) {
      const { data: comps } = await supabaseAdmin
        .from("competitions").select("id, month, year").in("id", compIds);
      compMap = new Map(((comps as Array<{ id: string; month: number; year: number }> | null) || [])
        .map((c) => [c.id, `${MONTHS[c.month]} ${c.year}`]));
    }
    return list.map((r) => ({
      id: r.id,
      grantedAt: r.granted_at,
      consumedAt: r.consumed_at,
      sourceTransactionId: r.source_transaction_id,
      competitionId: r.consumed_competition_id,
      competitionLabel: r.consumed_competition_id ? (compMap.get(r.consumed_competition_id) || null) : null,
      enrollmentId: r.consumed_enrollment_id,
    }));
  });

// ─── Admin: histórico de tentativas de uso de moeda ────────────────────────
export type AdminTokenAttemptRow = {
  id: string;
  createdAt: string;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  studentId: string | null;
  studentName: string | null;
  competitionId: string | null;
  groupId: string | null;
};

export const getAdminTokenAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    onlyFailures: z.boolean().optional(),
    limit: z.number().min(1).max(500).optional(),
  }).parse(input || {}))
  .handler(async ({ data, context }): Promise<AdminTokenAttemptRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Garantia: só admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) return [];
    let query = supabaseAdmin
      .from("challenge_token_attempts")
      .select("id, created_at, success, error_code, error_message, student_id, competition_id, group_id")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.onlyFailures) query = query.eq("success", false);
    const { data: rows } = await query;
    const list = ((rows as Array<{
      id: string; created_at: string; success: boolean;
      error_code: string | null; error_message: string | null;
      student_id: string | null; competition_id: string | null; group_id: string | null;
    }> | null) || []);
    const studentIds = Array.from(new Set(list.map((r) => r.student_id).filter(Boolean) as string[]));
    let nameMap = new Map<string, string>();
    if (studentIds.length > 0) {
      const { data: studs } = await supabaseAdmin
        .from("students").select("id, profile:profile_id(name)").in("id", studentIds);
      nameMap = new Map(((studs as Array<{ id: string; profile: { name: string } | null }> | null) || [])
        .map((s) => [s.id, s.profile?.name || "—"]));
    }
    return list.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      success: r.success,
      errorCode: r.error_code,
      errorMessage: r.error_message,
      studentId: r.student_id,
      studentName: r.student_id ? (nameMap.get(r.student_id) || null) : null,
      competitionId: r.competition_id,
      groupId: r.group_id,
    }));
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
