import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { snapshotMonthForAllCoaches } from "@/lib/network-unlock.server";
import { authorizeInternalCron, internalHookJson } from "@/server/internal-hook-auth.server";

const inputSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
}).strict().refine((value) => Boolean(value.year) === Boolean(value.month));

/**
 * Monthly snapshot job. Called by pg_cron on day 1 at 00:05.
 * By default snapshots the PREVIOUS month so the closed period is preserved.
 * Optional body: { year, month } to re-snapshot a specific period (idempotent).
 */
export const Route = createFileRoute("/api/public/hooks/network-unlock-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizeInternalCron(request);
        if (unauthorized) return unauthorized;

        let year: number;
        let month: number;
        const parsed = inputSchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          return internalHookJson({ error: "Parâmetros inválidos" }, 400);
        }
        if (parsed.data.year && parsed.data.month) {
          year = parsed.data.year;
          month = parsed.data.month;
        } else {
          const now = new Date();
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          year = prev.getFullYear();
          month = prev.getMonth() + 1;
        }

        try {
          const res = await snapshotMonthForAllCoaches(year, month);
          return internalHookJson({ ok: true, year, month, ...res });
        } catch (error: unknown) {
          console.error(
            "snapshot job failed",
            error instanceof Error ? error.message : "unknown error",
          );
          return internalHookJson({ ok: false, error: "Falha ao gerar snapshot" }, 500);
        }
      },
    },
  },
});
