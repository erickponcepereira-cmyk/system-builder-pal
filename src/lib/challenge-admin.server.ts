import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChallengeReportRow = {
  groupId: string;
  groupNumber: number | null;
  coachName: string;
  studentName: string;
  phone: string | null;
};

/** Atualiza o coach das inscrições de uma edição a partir do coach atual do aluno. */
export async function syncCoachesForCompetition(competitionId: string) {
  const { data: groups, error: gErr } = await supabaseAdmin
    .from("competition_groups")
    .select("id")
    .eq("competition_id", competitionId);
  if (gErr) throw new Error(gErr.message);
  const groupIds = (groups || []).map((g: { id: string }) => g.id);
  if (!groupIds.length) return { updated: 0, changes: [] as Array<{ student: string; from: string; to: string }> };

  return syncCoachesForGroups(groupIds);
}

export async function syncCoachesForGroups(groupIds: string[]) {
  if (!groupIds.length) return { updated: 0, changes: [] as Array<{ student: string; from: string; to: string }> };

  const { data: enrollments, error } = await supabaseAdmin
    .from("competition_enrollments")
    .select("id, student_id, coach_id")
    .in("group_id", groupIds);
  if (error) throw new Error(error.message);

  const rows = (enrollments || []) as Array<{ id: string; student_id: string; coach_id: string | null }>;
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean)));
  if (!studentIds.length) return { updated: 0, changes: [] };

  const { data: students } = await supabaseAdmin
    .from("students")
    .select("id, coach_id, profile_id")
    .in("id", studentIds);
  const studentRows = (students || []) as Array<{ id: string; coach_id: string | null; profile_id: string | null }>;
  const studentCoach = new Map(studentRows.map((s) => [s.id, s.coach_id]));

  const pending = rows.filter((r) => {
    const current = studentCoach.get(r.student_id);
    return current && current !== r.coach_id;
  });
  if (!pending.length) return { updated: 0, changes: [] };

  // Nomes para o resumo
  const coachIds = Array.from(
    new Set([
      ...pending.map((p) => p.coach_id).filter(Boolean),
      ...pending.map((p) => studentCoach.get(p.student_id)).filter(Boolean),
    ]),
  ) as string[];
  const [{ data: coaches }, { data: profs }] = await Promise.all([
    supabaseAdmin.from("coaches").select("id, profile_id").in("id", coachIds),
    supabaseAdmin
      .from("profiles")
      .select("id, name")
      .in("id", studentRows.map((s) => s.profile_id).filter(Boolean) as string[]),
  ]);
  const coachRows = (coaches || []) as Array<{ id: string; profile_id: string }>;
  const coachProfileIds = coachRows.map((c) => c.profile_id);
  const { data: coachProfs } = coachProfileIds.length
    ? await supabaseAdmin.from("profiles").select("id, name").in("id", coachProfileIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const nameByProfile = new Map(
    [...((profs || []) as Array<{ id: string; name: string }>), ...((coachProfs || []) as Array<{ id: string; name: string }>)].map(
      (p) => [p.id, p.name],
    ),
  );
  const coachName = (coachId: string | null | undefined) => {
    if (!coachId) return "—";
    const c = coachRows.find((x) => x.id === coachId);
    return (c && nameByProfile.get(c.profile_id)) || "—";
  };
  const studentName = (studentId: string) => {
    const s = studentRows.find((x) => x.id === studentId);
    return (s?.profile_id && nameByProfile.get(s.profile_id)) || "—";
  };

  const changes: Array<{ student: string; from: string; to: string }> = [];
  for (const p of pending) {
    const nextCoach = studentCoach.get(p.student_id)!;
    const { error: upErr } = await supabaseAdmin
      .from("competition_enrollments")
      .update({ coach_id: nextCoach })
      .eq("id", p.id);
    if (upErr) continue;
    changes.push({ student: studentName(p.student_id), from: coachName(p.coach_id), to: coachName(nextCoach) });
  }

  return { updated: changes.length, changes };
}

/** Linhas do relatório (aluno, coach, telefone) de uma edição ou de turmas específicas. */
export async function buildChallengeReport(opts: { competitionId?: string; groupIds?: string[] }): Promise<ChallengeReportRow[]> {
  let groupIds = opts.groupIds || [];
  if (!groupIds.length && opts.competitionId) {
    const { data: groups } = await supabaseAdmin
      .from("competition_groups")
      .select("id")
      .eq("competition_id", opts.competitionId);
    groupIds = ((groups || []) as Array<{ id: string }>).map((g) => g.id);
  }
  if (!groupIds.length) return [];

  const { data: groupsFull } = await supabaseAdmin
    .from("competition_groups")
    .select("id, group_number")
    .in("id", groupIds);
  const groupNumber = new Map(
    ((groupsFull || []) as Array<{ id: string; group_number: number | null }>).map((g) => [g.id, g.group_number]),
  );

  const { data: enrollments, error } = await supabaseAdmin
    .from("competition_enrollments")
    .select("id, group_id, student_id, coach_id")
    .in("group_id", groupIds);
  if (error) throw new Error(error.message);
  const rows = (enrollments || []) as Array<{ id: string; group_id: string; student_id: string; coach_id: string | null }>;
  if (!rows.length) return [];

  const [{ data: students }, { data: coaches }] = await Promise.all([
    supabaseAdmin
      .from("students")
      .select("id, profile_id")
      .in("id", Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean)))),
    supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .in("id", Array.from(new Set(rows.map((r) => r.coach_id).filter(Boolean))) as string[]),
  ]);
  const studentRows = (students || []) as Array<{ id: string; profile_id: string | null }>;
  const coachRows = (coaches || []) as Array<{ id: string; profile_id: string }>;

  const profileIds = Array.from(
    new Set([
      ...studentRows.map((s) => s.profile_id).filter(Boolean),
      ...coachRows.map((c) => c.profile_id).filter(Boolean),
    ]),
  ) as string[];
  const { data: profs } = profileIds.length
    ? await supabaseAdmin.from("profiles").select("id, name, phone").in("id", profileIds)
    : { data: [] as Array<{ id: string; name: string; phone: string | null }> };
  const profMap = new Map(
    ((profs || []) as Array<{ id: string; name: string; phone: string | null }>).map((p) => [p.id, p]),
  );

  const out: ChallengeReportRow[] = rows.map((r) => {
    const s = studentRows.find((x) => x.id === r.student_id);
    const c = coachRows.find((x) => x.id === r.coach_id);
    const sp = s?.profile_id ? profMap.get(s.profile_id) : undefined;
    const cp = c?.profile_id ? profMap.get(c.profile_id) : undefined;
    return {
      groupId: r.group_id,
      groupNumber: groupNumber.get(r.group_id) ?? null,
      coachName: cp?.name || "Sem coach",
      studentName: sp?.name || "—",
      phone: sp?.phone || null,
    };
  });

  return out.sort(
    (a, b) =>
      a.coachName.localeCompare(b.coachName, "pt-BR") || a.studentName.localeCompare(b.studentName, "pt-BR"),
  );
}
