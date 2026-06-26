import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Retorna o CPF do próprio usuário autenticado.
 * Não gera registro de auditoria — é o dono acessando o próprio dado.
 */
export const getMyCpf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_cpf");
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  });

/**
 * Admin revela o CPF de outro usuário.
 * Toda chamada bem-sucedida gera registro em `lgpd_access_log` (LGPD Art. 37).
 * Falha com 403 se o chamador não for admin.
 */
export const adminRevealCpf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId: string; reason?: string | null }) =>
    z.object({
      targetUserId: z.string().uuid(),
      reason: z.string().max(500).nullable().optional(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { data: cpf, error } = await context.supabase.rpc("admin_reveal_cpf", {
      target_user_id: data.targetUserId,
      reason: data.reason ?? null,
    });
    if (error) {
      // 42501 = insufficient_privilege from PG
      throw new Error(error.message || "Forbidden");
    }
    return (cpf as string | null) ?? null;
  });

/**
 * Lista o histórico de acessos a CPF de um usuário (admin only).
 */
export const listCpfAccessLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { targetUserId?: string | null }) =>
    z.object({ targetUserId: z.string().uuid().nullable().optional() }).parse(data)
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("lgpd_access_log")
      .select("id, actor_user_id, actor_role, target_user_id, field, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.targetUserId) q = q.eq("target_user_id", data.targetUserId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows || [];
  });
