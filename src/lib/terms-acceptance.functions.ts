// Server functions para registrar aceite de termos (auditoria LGPD).
// A inserção respeita RLS: policy "Users insert own acceptance" exige user_id = auth.uid().

import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const recordSchema = z.object({
  termType: z.enum(["aluno", "coach", "parceiro", "profissional", "desafio"]),
  termVersion: z.string().min(1).max(32),
  contentHash: z.string().max(128).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

export const recordTermsAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.input<typeof recordSchema>) => recordSchema.parse(data))
  .handler(async ({ data, context }) => {
    let ip: string | null = null;
    let ua: string | null = null;
    try {
      ip = getRequestIP({ xForwardedFor: true }) || null;
      ua = getRequestHeader("user-agent") || null;
    } catch {
      /* SSR/edge fallback */
    }

    const { error } = await context.supabase.from("terms_acceptances").insert({
      user_id: context.userId,
      term_type: data.termType,
      term_version: data.termVersion,
      content_hash: data.contentHash ?? null,
      ip_address: ip,
      user_agent: ua,
      context: data.context ?? {},
    });

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Fallback client-side (sem middleware): utilizado logo após signUp,
 * quando a sessão pode ainda não estar 100% propagada. Se você já tem
 * sessão autenticada, prefira `recordTermsAcceptance` acima.
 */
export const recordTermsAcceptanceClient = async (
  supabase: ReturnType<typeof import("@/integrations/supabase/client").supabase.from> extends never
    ? never
    : import("@supabase/supabase-js").SupabaseClient,
  params: {
    userId: string;
    termType: "aluno" | "coach" | "parceiro" | "profissional" | "desafio";
    termVersion: string;
    context?: Record<string, unknown>;
  },
) => {
  const { error } = await supabase.from("terms_acceptances").insert({
    user_id: params.userId,
    term_type: params.termType,
    term_version: params.termVersion,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    context: params.context ?? {},
  });
  if (error) console.warn("[terms] falha ao registrar aceite:", error.message);
};
