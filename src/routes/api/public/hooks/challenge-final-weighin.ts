import { createFileRoute } from "@tanstack/react-router";

/**
 * Roda na virada do dia (00:05 America/Cuiaba) via pg_cron.
 * Para cada turma cuja pesagem final é hoje: sincroniza os coaches das inscrições,
 * grava o relatório do dia e notifica os admins.
 */
export const Route = createFileRoute("/api/public/hooks/challenge-final-weighin")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { syncCoachesForGroups, buildChallengeReport } = await import("@/lib/challenge-admin.server");

          const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba" }).format(new Date());

          const { data: groups, error } = await supabaseAdmin
            .from("competition_groups")
            .select("id, group_number, competition_id, final_weigh_in_date")
            .eq("final_weigh_in_date", today);
          if (error) throw new Error(error.message);

          const rows = (groups || []) as Array<{
            id: string;
            group_number: number | null;
            competition_id: string;
            final_weigh_in_date: string;
          }>;
          if (!rows.length) {
            return Response.json({ ok: true, date: today, groups: 0 });
          }

          await syncCoachesForGroups(rows.map((g) => g.id));

          const { data: admins } = await supabaseAdmin.from("profiles").select("id").eq("role", "admin");
          const adminIds = ((admins || []) as Array<{ id: string }>).map((a) => a.id);

          let saved = 0;
          for (const g of rows) {
            const payload = await buildChallengeReport({ groupIds: [g.id] });
            const { error: upErr } = await supabaseAdmin
              .from("challenge_final_reports" as never)
              .upsert(
                {
                  competition_id: g.competition_id,
                  group_id: g.id,
                  report_date: today,
                  payload,
                } as never,
                { onConflict: "group_id,report_date" } as never,
              );
            if (!upErr) saved++;

            if (adminIds.length) {
              await supabaseAdmin.from("notifications").insert(
                adminIds.map((profileId) => ({
                  profile_id: profileId,
                  type: "challenge_final_weighin",
                  title: `Pesagem final hoje — Turma ${g.group_number ?? "?"}`,
                  message: `Relatório do desafio gerado automaticamente com ${payload.length} aluno(s).`,
                  action_url: "/admin/challenge",
                })),
              );
            }
          }

          return Response.json({ ok: true, date: today, groups: rows.length, saved });
        } catch (e) {
          console.error("challenge-final-weighin failed", e);
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
