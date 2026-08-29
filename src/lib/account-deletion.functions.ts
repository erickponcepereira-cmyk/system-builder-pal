import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const requestInput = z.object({
  confirmation: z.literal("EXCLUIR"),
});

export type AccountDeletionRequest = {
  id: string;
  status: "pending" | "cancelled" | "completed" | "rejected";
  processingState: "queued" | "processing" | "retry" | "blocked" | "cancelled" | "completed";
  requestedAt: string;
  dueAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
};

type DeletionRequestRow = {
  id: string;
  status: AccountDeletionRequest["status"];
  processing_state: AccountDeletionRequest["processingState"];
  requested_at: string;
  due_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
};

function mapRequest(row: DeletionRequestRow): AccountDeletionRequest {
  return {
    id: row.id,
    status: row.status,
    processingState: row.processing_state,
    requestedAt: row.requested_at,
    dueAt: row.due_at,
    cancelledAt: row.cancelled_at,
    completedAt: row.completed_at,
  };
}

async function findPendingRequest(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("account_deletion_requests" as never)
    .select("id,status,processing_state,requested_at,due_at,cancelled_at,completed_at" as never)
    .eq("user_id" as never, userId as never)
    .eq("status" as never, "pending" as never)
    .maybeSingle();
  if (error) throw new Error("Não foi possível consultar a solicitação de exclusão.");
  return data ? mapRequest(data as unknown as DeletionRequestRow) : null;
}

export const getMyAccountDeletionRequest = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => findPendingRequest(context.userId));

/**
 * Registra um pedido idempotente de exclusão para a identidade do JWT.
 * O processamento fica auditável porque parte dos registros precisa ser
 * anonimizada/retida, e não simplesmente apagada em cascata.
 */
export const requestMyAccountDeletion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestInput.parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const existing = await findPendingRequest(context.userId);
    if (existing) return existing;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: authUser, error: authError }, { data: profile, error: profileError }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(context.userId),
      supabaseAdmin
        .from("profiles")
        .select("id,email,role")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (authError) throw new Error("Não foi possível confirmar a titularidade da conta.");
    if (profileError) throw new Error("Não foi possível localizar o perfil da conta.");

    const email = authUser.user?.email ?? profile?.email;
    if (!email) throw new Error("A conta não possui um e-mail confirmado para acompanhar a solicitação.");

    const now = new Date();
    const dueAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const { data, error } = await supabaseAdmin
      .from("account_deletion_requests" as never)
      .insert({
        user_id: context.userId,
        profile_id: profile?.id ?? null,
        email_snapshot: email.toLowerCase(),
        role_snapshot: profile?.role ?? null,
        subject_user_id: context.userId,
        subject_profile_id: profile?.id ?? null,
        status: "pending",
        processing_state: "queued",
        processing_stage: "awaiting_due_date",
        requested_at: now.toISOString(),
        due_at: dueAt.toISOString(),
      } as never)
      .select("id,status,processing_state,requested_at,due_at,cancelled_at,completed_at" as never)
      .single();

    if (error) {
      const concurrent = await findPendingRequest(context.userId);
      if (concurrent) return concurrent;
      throw new Error("Não foi possível registrar a solicitação de exclusão.");
    }

    return mapRequest(data as unknown as DeletionRequestRow);
  });

export const cancelMyAccountDeletion = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const pending = await findPendingRequest(context.userId);
    if (!pending) return { ok: true };
    if (pending.processingState !== "queued") {
      throw new Error("A exclusão já entrou em processamento e não pode mais ser cancelada.");
    }

    const { data, error } = await context.supabase.rpc(
      "cancel_own_account_deletion_request" as never,
      { _request_id: pending.id } as never,
    );
    if (error) throw new Error("Não foi possível cancelar a solicitação.");
    if (data !== true) {
      throw new Error("A exclusão já entrou em processamento e não pode mais ser cancelada.");
    }
    return { ok: true };
  });
