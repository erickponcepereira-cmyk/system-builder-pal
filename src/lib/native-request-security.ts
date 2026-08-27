import { createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

const CAPACITOR_ORIGINS = new Set([
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
]);

function isCapacitorOrigin(origin: string | null): origin is string {
  return origin !== null && CAPACITOR_ORIGINS.has(origin);
}

function corsHeaders(request: Request, origin: string) {
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  const headers = new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      requestedHeaders ||
      "authorization, content-type, x-tsr-serverfn, x-fitmind-app-version",
    "Access-Control-Expose-Headers":
      "content-type, x-tss-serialized, x-tss-raw, x-tss-context",
    "Access-Control-Max-Age": "86400",
  });
  headers.append("Vary", "Origin");
  headers.append("Vary", "Access-Control-Request-Headers");
  return headers;
}

/**
 * Libera somente as origens fixas usadas pelos WebViews do Capacitor. O token
 * bearer continua obrigatório nas funções autenticadas; nenhuma origem web
 * arbitrária recebe acesso cross-origin.
 */
export const capacitorCorsMiddleware = createMiddleware().server(async (ctx) => {
  const origin = ctx.request.headers.get("Origin");
  if (!isCapacitorOrigin(origin)) return ctx.next();

  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(ctx.request, origin) });
  }

  const result = await ctx.next();
  const headers = new Headers(result.response.headers);
  corsHeaders(ctx.request, origin).forEach((value, key) => headers.append(key, value));

  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  };
});

/** Proteção CSRF explícita para web e para o shell nativo identificado. */
export const serverFnCsrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  origin: (origin, ctx) =>
    origin === new URL(ctx.request.url).origin || isCapacitorOrigin(origin),
  secFetchSite: (site, ctx) => {
    if (site === "same-origin" || site === "same-site") return true;
    return isCapacitorOrigin(ctx.request.headers.get("Origin"));
  },
});
