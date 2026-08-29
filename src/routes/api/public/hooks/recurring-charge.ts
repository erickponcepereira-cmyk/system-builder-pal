import { createFileRoute } from "@tanstack/react-router";
import { authorizeInternalCron, internalHookJson } from "@/server/internal-hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/recurring-charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = authorizeInternalCron(request);
        if (unauthorized) return unauthorized;
        try {
          const { chargeDueSubscriptions } = await import("@/lib/recurring.server");
          const result = await chargeDueSubscriptions();
          return internalHookJson({ ok: true, ...result });
        } catch (error: unknown) {
          console.error(
            "[recurring-charge]",
            error instanceof Error ? error.message : "unknown error",
          );
          return internalHookJson({ ok: false, error: "Falha ao processar recorrências" }, 500);
        }
      },
    },
  },
});
