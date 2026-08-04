import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type ChallengeReportRow = {
  groupId: string;
  groupNumber: number | null;
  coachName: string;
  studentName: string;
  phone: string | null;
};

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "admin") throw new Error("Acesso restrito ao admin");
  return profile.id as string;
}

/** Atualiza o coach de cada inscrição para o coach atual do aluno. */
export const syncEnrollmentCoaches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { competitionId: string }) => z.object({ competitionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { syncCoachesForCompetition } = await import("@/lib/challenge-admin.server");
    return syncCoachesForCompetition(data.competitionId);
  });

/** Relatório: alunos agrupados por coach, com telefone. */
export const getChallengeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { competitionId: string }) => z.object({ competitionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ChallengeReportRow[]> => {
    await assertAdmin(context.userId);
    const { buildChallengeReport } = await import("@/lib/challenge-admin.server");
    return buildChallengeReport({ competitionId: data.competitionId });
  });
