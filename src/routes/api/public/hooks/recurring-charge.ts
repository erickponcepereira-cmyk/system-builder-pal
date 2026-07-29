import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/recurring-charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { chargeDueSubscriptions } = await import("@/lib/recurring.server");
          const result = await chargeDueSubscriptions();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[recurring-charge]", e);
          return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
        }
      },
    },
  },
});
