import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { safeSecretEqual } from "@/lib/account-deletion-processor-core";

const bodySchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
  requestId: z.string().uuid().optional(),
  retryBlocked: z.boolean().optional(),
}).strict();

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function bearerToken(request: Request): string | null {
  const match = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const Route = createFileRoute("/api/public/hooks/account-deletion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ACCOUNT_DELETION_PROCESSOR_SECRET?.trim() ?? "";
        if (expected.length < 32) {
          console.error("ACCOUNT_DELETION_PROCESSOR_SECRET is missing or too short");
          return json({ error: "Serviço temporariamente indisponível" }, 503);
        }

        const supplied = bearerToken(request) ?? "";
        if (!safeSecretEqual(supplied, expected)) {
          return json({ error: "Não autorizado" }, 401);
        }

        let rawBody: unknown;
        try {
          rawBody = await request.json();
        } catch {
          return json({ error: "JSON inválido" }, 400);
        }

        const parsed = bodySchema.safeParse(rawBody);
        if (!parsed.success) {
          return json({ error: "Parâmetros inválidos" }, 400);
        }

        try {
          const { runAccountDeletionBatch } = await import(
            "@/lib/account-deletion-processor.server"
          );
          const result = await runAccountDeletionBatch(parsed.data);
          return json(result);
        } catch (error) {
          console.error(
            "[account-deletion] processor hook failed",
            error instanceof Error ? error.message : "unknown error",
          );
          return json({ error: "Falha ao executar o processador" }, 500);
        }
      },
    },
  },
});
