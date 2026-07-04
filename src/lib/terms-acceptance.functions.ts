// Server functions para registrar aceite de termos (auditoria LGPD).
//
// Duas variantes:
//   1) recordTermsAcceptance — usuário autenticado (fluxo normal em app).
//   2) recordTermsAcceptanceAtSignup — pós-signup, quando o usuário ainda
//      não confirmou e-mail e não há sessão. Usa supabaseAdmin (mesmo padrão
//      de finalizeRegistrationFn).

import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const baseSchema = z.object({
  termType: z.enum(["aluno", "coach", "parceiro", "profissional", "desafio"]),
  termVersion: z.string().min(1).max(32),
  contentHash: z.string().max(128).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

function readRequestSignals() {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ip = getRequestIP({ xForwardedFor: true }) || null;
    ua = getRequestHeader("user-agent") || null;
  } catch {
    /* ignore SSR/edge fallback */
  }
  return { ip, ua };
}

export const recordTermsAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.input<typeof baseSchema>) => baseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { ip, ua } = readRequestSignals();
    const { error } = await context.supabase.from("terms_acceptances").insert({
      user_id: context.userId,
      term_type: data.termType,
      term_version: data.termVersion,
      content_hash: data.contentHash ?? null,
      ip_address: ip,
      user_agent: ua,
      context: (data.context ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const signupSchema = baseSchema.extend({
  userId: z.string().uuid(),
});

export const recordTermsAcceptanceAtSignup = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof signupSchema>) => signupSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ip, ua } = readRequestSignals();
    const { error } = await supabaseAdmin.from("terms_acceptances").insert({
      user_id: data.userId,
      term_type: data.termType,
      term_version: data.termVersion,
      content_hash: data.contentHash ?? null,
      ip_address: ip,
      user_agent: ua,
      context: (data.context ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
