import { createFileRoute } from "@tanstack/react-router";

// Varredura automática de pagamentos Mercado Pago (rede de segurança do webhook).
// Chamada por pg_cron a cada 15 minutos.
export const Route = createFileRoute("/api/public/hooks/mp-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey =
          request.headers.get("apikey") || request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { sweepMpPayments } = await import("@/lib/mp-sweep.server");
          const result = await sweepMpPayments();
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("[mp-sweep]", e);
          return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
        }
      },
    },
  },
});
