import { createFileRoute } from "@tanstack/react-router";
import { snapshotMonthForAllCoaches } from "@/lib/network-unlock.server";

/**
 * Monthly snapshot job. Called by pg_cron on day 1 at 00:05.
 * By default snapshots the PREVIOUS month so the closed period is preserved.
 * Optional body: { year, month } to re-snapshot a specific period (idempotent).
 */
export const Route = createFileRoute("/api/public/hooks/network-unlock-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let year: number;
        let month: number;
        try {
          const body = await request.json().catch(() => ({})) as { year?: number; month?: number };
          if (body.year && body.month) {
            year = Number(body.year);
            month = Number(body.month);
          } else {
            const now = new Date();
            // previous month
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            year = prev.getFullYear();
            month = prev.getMonth() + 1;
          }
        } catch {
          const now = new Date();
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          year = prev.getFullYear();
          month = prev.getMonth() + 1;
        }

        try {
          const res = await snapshotMonthForAllCoaches(year, month);
          return new Response(JSON.stringify({ ok: true, year, month, ...res }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("snapshot job failed", e);
          return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
