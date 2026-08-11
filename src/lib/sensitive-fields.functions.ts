import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Campos sensíveis (dados bancários/PIX de coach e CPF de perfis) deixaram de
 * ser legíveis pelo navegador: o banco só concede SELECT nas colunas não
 * sensíveis. Toda leitura desses campos passa por aqui, com verificação de
 * dono (própria conta) ou de admin no servidor.
 */

export type CoachPayoutInfo = {
  coachId: string;
  pix_key: string;
  pix_key_type: string;
  bank_name: string;
  bank_agency: string;
  bank_account: string;
  bank_account_type: string;
} | null;

/** Dados bancários do coach logado (somente da própria conta). */
export const getMyCoachPayoutInfo = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoachPayoutInfo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) return null;
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id,pix_key,pix_key_type,bank_name,bank_agency,bank_account,bank_account_type")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) return null;
    const c = coach as unknown as Record<string, string | null>;
    return {
      coachId: String(c.id),
      pix_key: c.pix_key || "",
      pix_key_type: c.pix_key_type || "cpf",
      bank_name: c.bank_name || "",
      bank_agency: c.bank_agency || "",
      bank_account: c.bank_account || "",
      bank_account_type: c.bank_account_type || "corrente",
    };
  });

/** Lista completa de coaches para o painel admin (inclui PIX). Somente admin. */
export const listAdminCoaches = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .handler(async ({ context }): Promise<Record<string, any>[]> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);
    const { data, error } = await supabaseAdmin
      .from("coaches")
      .select("*, profiles!coaches_profile_id_fkey(id,name,email,phone,city,state,status)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data as unknown as Record<string, unknown>[]) || [];
  });

/** CPF de um conjunto de perfis. Somente admin. */
export const fetchProfileCpfs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ profileIds: z.array(z.string().uuid()).max(2000) }).parse(input),
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<Record<string, string | null>> => {
    const { assertAdminProfile } = await import("./admin-network.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdminProfile(context.userId);
    if (data.profileIds.length === 0) return {};
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id,cpf")
      .in("id", data.profileIds);
    if (error) throw new Error(error.message);
    const map: Record<string, string | null> = {};
    ((rows as Array<{ id: string; cpf: string | null }>) || []).forEach((r) => {
      map[r.id] = r.cpf;
    });
    return map;
  });
