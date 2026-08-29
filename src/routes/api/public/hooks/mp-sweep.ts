import { createFileRoute } from "@tanstack/react-router";
import { authorizeInternalCron, internalHookJson } from "@/server/internal-hook-auth.server";

// Varredura automática de pagamentos Mercado Pago (rede de segurança do webhook).
// Chamada por pg_cron a cada 15 minutos.
export const Route = createFileRoute("/api/public/hooks/mp-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizeInternalCron(request);
        if (unauthorized) return unauthorized;
        try {
          const { sweepMpPayments } = await import("@/lib/mp-sweep.server");
          const result = await sweepMpPayments();
          return internalHookJson({ ok: true, ...result });
        } catch (error: unknown) {
          console.error("[mp-sweep]", error instanceof Error ? error.message : "unknown error");
          return internalHookJson({ ok: false, error: "Falha na conciliação de pagamentos" }, 500);
        }
      },
    },
  },
});
