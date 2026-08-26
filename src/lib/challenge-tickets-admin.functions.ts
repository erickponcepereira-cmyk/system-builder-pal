import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || (profile as { role?: string }).role !== "admin") throw new Error("Acesso restrito ao admin.");
  return (profile as { id: string }).id;
}

export type StudentTicketInfo = {
  studentId: string;
  balance: number;
  earned: number;
  consumed: number;
};

/** Saldo de tickets de um aluno (admin). */
export const getStudentTicketInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { studentId: string }) => z.object({ studentId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<StudentTicketInfo> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("student_challenge_tokens")
      .select("id, consumed_at")
      .eq("student_id", data.studentId);
    const list = ((rows as Array<{ id: string; consumed_at: string | null }> | null) || []);
    const earned = list.length;
    const consumed = list.filter((r) => !!r.consumed_at).length;
    return { studentId: data.studentId, balance: earned - consumed, earned, consumed };
  });

/** Concede tickets de desafio manualmente (admin). */
export const grantChallengeTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { studentId: string; quantity?: number; reason?: string }) =>
    z.object({
      studentId: uuid,
      quantity: z.number().int().min(1).max(10).default(1),
      reason: z.string().trim().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminProfileId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Aluno não encontrado.");

    const notes = `Liberação manual pelo admin${data.reason ? ` — ${data.reason}` : ""} (perfil ${adminProfileId})`;
    const payload = Array.from({ length: data.quantity }, () => ({
      student_id: data.studentId,
      granted_by: "admin",
      notes,
    }));
    const { error } = await supabaseAdmin.from("student_challenge_tokens").insert(payload as never);
    if (error) throw new Error(error.message);
    return { ok: true as const, granted: data.quantity };
  });

/**
 * Inscreve um aluno manualmente numa turma e consome um ticket disponível.
 * `ticketMode`: "consume" usa um ticket livre (erro se não houver),
 * "grant" concede um ticket na hora e consome, "courtesy" inscreve sem ticket.
 */
export const adminEnrollStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    competitionId: string; groupId: string; studentId: string;
    gender: "M" | "F"; ticketMode: "consume" | "grant" | "courtesy";
  }) =>
    z.object({
      competitionId: uuid,
      groupId: uuid,
      studentId: uuid,
      gender: z.enum(["M", "F"]),
      ticketMode: z.enum(["consume", "grant", "courtesy"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminProfileId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, coach_id")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Aluno não encontrado.");

    const { data: already } = await supabaseAdmin
      .from("competition_enrollments")
      .select("id")
      .eq("student_id", data.studentId)
      .eq("competition_id", data.competitionId)
      .maybeSingle();
    if (already) throw new Error("Este aluno já está inscrito nesta edição do desafio.");

    // Ticket a consumir
    let tokenId: string | null = null;
    if (data.ticketMode !== "courtesy") {
      const { data: free } = await supabaseAdmin
        .from("student_challenge_tokens")
        .select("id")
        .eq("student_id", data.studentId)
        .is("consumed_at", null)
        .order("granted_at", { ascending: true })
        .limit(1);
      tokenId = ((free as Array<{ id: string }> | null) || [])[0]?.id ?? null;

      if (!tokenId && data.ticketMode === "grant") {
        const { data: created, error: grantErr } = await supabaseAdmin
          .from("student_challenge_tokens")
          .insert({
            student_id: data.studentId,
            granted_by: "admin",
            notes: `Ticket concedido na inscrição manual pelo admin (perfil ${adminProfileId})`,
          } as never)
          .select("id")
          .single();
        if (grantErr) throw new Error(grantErr.message);
        tokenId = (created as { id: string }).id;
      }
      if (!tokenId) throw new Error("O aluno não tem ticket disponível. Conceda um ticket ou inscreva como cortesia.");
    }

    const { data: enrollment, error: enrollErr } = await supabaseAdmin
      .from("competition_enrollments")
      .insert({
        competition_id: data.competitionId,
        group_id: data.groupId,
        student_id: data.studentId,
        coach_id: (student as { coach_id: string | null }).coach_id,
        gender: data.gender,
        enrolled_by: "admin",
      } as never)
      .select("id")
      .single();
    if (enrollErr) throw new Error(enrollErr.message);
    const enrollmentId = (enrollment as { id: string }).id;

    if (tokenId) {
      await supabaseAdmin
        .from("student_challenge_tokens")
        .update({
          consumed_at: new Date().toISOString(),
          consumed_competition_id: data.competitionId,
          consumed_enrollment_id: enrollmentId,
        } as never)
        .eq("id", tokenId);
    }

    return { ok: true as const, enrollmentId, ticketConsumed: !!tokenId, courtesy: !tokenId };
  });

export type DuplicateAccountRow = {
  key: string;
  keyKind: "telefone" | "cpf";
  profiles: Array<{
    profileId: string;
    studentId: string | null;
    name: string | null;
    email: string | null;
    createdAt: string | null;
    mergedInto: string | null;
    tickets: number;
    enrollments: number;
    orders: number;
    lastSeen: string | null;
  }>;
};

/** Lista cadastros duplicados (mesmo telefone ou CPF) com histórico de cada um. */
export const listDuplicateAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuplicateAccountRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, cpf, created_at, merged_into_profile_id")
      .limit(20000);
    if (error) throw new Error(error.message);
    const rows = ((profiles as Array<{
      id: string; name: string | null; email: string | null; phone: string | null;
      cpf: string | null; created_at: string | null; merged_into_profile_id: string | null;
    }> | null) || []);

    const groups = new Map<string, { kind: "telefone" | "cpf"; ids: string[] }>();
    const push = (kind: "telefone" | "cpf", raw: string | null, id: string) => {
      const digits = (raw || "").replace(/\D/g, "");
      if (digits.length < (kind === "cpf" ? 11 : 10)) return;
      const key = `${kind}:${digits}`;
      const g = groups.get(key) || { kind, ids: [] };
      if (!g.ids.includes(id)) g.ids.push(id);
      groups.set(key, g);
    };
    rows.forEach((r) => {
      push("telefone", r.phone, r.id);
      push("cpf", r.cpf, r.id);
    });

    const dupGroups = Array.from(groups.entries()).filter(([, g]) => g.ids.length > 1);
    if (!dupGroups.length) return [];

    const profileIds = Array.from(new Set(dupGroups.flatMap(([, g]) => g.ids)));
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, profile_id")
      .in("profile_id", profileIds);
    const studentRows = ((students as Array<{ id: string; profile_id: string }> | null) || []);
    const studentByProfile = new Map(studentRows.map((s) => [s.profile_id, s.id]));
    const studentIds = studentRows.map((s) => s.id);

    const [tokensRes, enrollsRes, ordersRes] = await Promise.all([
      studentIds.length
        ? supabaseAdmin.from("student_challenge_tokens").select("student_id").in("student_id", studentIds)
        : Promise.resolve({ data: [] as Array<{ student_id: string }> }),
      studentIds.length
        ? supabaseAdmin.from("competition_enrollments").select("student_id").in("student_id", studentIds)
        : Promise.resolve({ data: [] as Array<{ student_id: string }> }),
      studentIds.length
        ? supabaseAdmin.from("store_orders").select("student_id").in("student_id", studentIds)
        : Promise.resolve({ data: [] as Array<{ student_id: string }> }),
    ]);
    const count = (res: { data: unknown }) => {
      const map = new Map<string, number>();
      ((res.data as Array<{ student_id: string | null }> | null) || []).forEach((r) => {
        if (!r.student_id) return;
        map.set(r.student_id, (map.get(r.student_id) || 0) + 1);
      });
      return map;
    };
    const tokenCount = count(tokensRes);
    const enrollCount = count(enrollsRes);
    const orderCount = count(ordersRes);

    const byId = new Map(rows.map((r) => [r.id, r]));
    const out: DuplicateAccountRow[] = dupGroups.map(([key, g]) => ({
      key: key.split(":")[1] ?? key,
      keyKind: g.kind,
      profiles: g.ids.map((id) => {
        const p = byId.get(id)!;
        const studentId = studentByProfile.get(id) ?? null;
        return {
          profileId: id,
          studentId,
          name: p.name,
          email: p.email,
          createdAt: p.created_at,
          mergedInto: p.merged_into_profile_id,
          tickets: studentId ? tokenCount.get(studentId) || 0 : 0,
          enrollments: studentId ? enrollCount.get(studentId) || 0 : 0,
          orders: studentId ? orderCount.get(studentId) || 0 : 0,
          lastSeen: null,
        };
      }),
    }));

    // Grupos já resolvidos (alguém foi mesclado) vão para o fim.
    return out.sort((a, b) => {
      const aOpen = a.profiles.every((p) => !p.mergedInto) ? 0 : 1;
      const bOpen = b.profiles.every((p) => !p.mergedInto) ? 0 : 1;
      return aOpen - bOpen;
    });
  });
