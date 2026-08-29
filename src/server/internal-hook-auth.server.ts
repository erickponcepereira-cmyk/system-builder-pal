import { safeSecretEqual } from "@/lib/account-deletion-processor-core";

export function internalHookJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function authorizeInternalCron(request: Request): Response | null {
  const expected = process.env.INTERNAL_CRON_SECRET?.trim() ?? "";
  if (expected.length < 32) {
    console.error("INTERNAL_CRON_SECRET is missing or too short");
    return internalHookJson({ error: "Serviço temporariamente indisponível" }, 503);
  }

  const match = (request.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!safeSecretEqual(match?.[1]?.trim() ?? "", expected)) {
    return internalHookJson({ error: "Não autorizado" }, 401);
  }
  return null;
}
