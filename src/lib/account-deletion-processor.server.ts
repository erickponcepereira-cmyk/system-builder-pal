import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  AccountDeletionProcessorError,
  cardMatchesDeletionOwner,
  customerMatchesDeletionOwner,
  normalizeDeletionEmail,
  preapprovalMatchesDeletionOwner,
  processClaimedAccountDeletion,
  type AccountDeletionExternalPlan,
  type AccountDeletionProcessorDependencies,
  type AccountDeletionRetentionSummary,
  type AccountDeletionStage,
  type AccountDeletionStorageObject,
  type ClaimedAccountDeletion,
} from "./account-deletion-processor-core";

type ClaimedRow = {
  request_id: string;
  subject_user_id: string;
  subject_profile_id: string | null;
  lock_token: string;
  attempt_count: number;
};

type StorageManifestRow = {
  bucket_id: string;
  name: string;
};

type BatchResult = {
  requestId: string;
  outcome: "completed" | "retry" | "blocked";
  errorCode?: string;
};

export type AccountDeletionBatchSummary = {
  claimed: number;
  completed: number;
  retry: number;
  blocked: number;
  results: BatchResult[];
};

const preflightSchema = z.object({
  blockers: z.array(z.string().min(3).max(80)),
  studentCount: z.number().int().nonnegative(),
  coachCount: z.number().int().nonnegative(),
  partnerCount: z.number().int().nonnegative(),
});

const freezeSchema = z.object({
  frozen: z.literal(true),
  subscriptionCount: z.number().int().nonnegative(),
});

const anonymizationSchema = z.object({
  processorVersion: z.literal(1),
  profilesAnonymized: z.literal(1),
  studentsAnonymized: z.number().int().nonnegative(),
  coachesAnonymized: z.number().int().nonnegative(),
  partnersAnonymized: z.number().int().nonnegative(),
  paymentsAnonymized: z.number().int().nonnegative(),
  ordersAnonymized: z.number().int().nonnegative(),
  financialHistoryRetained: z.literal(true),
});

function deletionError(
  stage: AccountDeletionStage,
  code: string,
  retryable: boolean,
): AccountDeletionProcessorError {
  return new AccountDeletionProcessorError(stage, code, retryable);
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const value = Number((error as { status?: unknown }).status);
  return Number.isFinite(value) ? value : null;
}

function authResourceMissing(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 404) return true;
  const message = error instanceof Error ? error.message : "";
  return /not found|user not found/i.test(message);
}

async function setStage(
  request: ClaimedAccountDeletion,
  stage: AccountDeletionStage,
  metadata: Record<string, number | boolean | string> = {},
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    "account_deletion_set_stage" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
      _stage: stage,
      _metadata: metadata,
    } as never,
  );
  if (error) throw deletionError(stage, "PROCESSOR_LEASE_LOST", true);
}

async function preflight(request: ClaimedAccountDeletion) {
  const { data, error } = await supabaseAdmin.rpc(
    "account_deletion_preflight" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
    } as never,
  );
  if (error) throw deletionError("preflight", "PREFLIGHT_QUERY_FAILED", true);
  const parsed = preflightSchema.safeParse(data);
  if (!parsed.success) {
    throw deletionError("preflight", "PREFLIGHT_RESPONSE_INVALID", false);
  }
  return { blockers: parsed.data.blockers };
}

async function freezeBilling(request: ClaimedAccountDeletion): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc(
    "account_deletion_freeze_billing" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
    } as never,
  );
  if (error) {
    const code = /payment reconciliation required/i.test(error.message)
      ? "PAYMENT_RECONCILIATION_REQUIRED"
      : "BILLING_FREEZE_FAILED";
    throw deletionError("freeze_billing", code, code !== "PAYMENT_RECONCILIATION_REQUIRED");
  }
  if (!freezeSchema.safeParse(data).success) {
    throw deletionError("freeze_billing", "BILLING_FREEZE_RESPONSE_INVALID", false);
  }
}

async function lockIdentity(request: ClaimedAccountDeletion): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(request.userId);
  if (error) {
    if (authResourceMissing(error)) return;
    throw deletionError("lock_identity", "AUTH_LOOKUP_FAILED", true);
  }
  if (!data.user) return;

  const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
    request.userId,
    { ban_duration: "876000h" },
  );
  if (banError) {
    throw deletionError("lock_identity", "AUTH_LOCK_FAILED", true);
  }
}

async function loadExternalPlan(
  request: ClaimedAccountDeletion,
): Promise<AccountDeletionExternalPlan> {
  const studentsPromise = request.profileId
    ? supabaseAdmin.from("students").select("id").eq("profile_id", request.profileId)
    : Promise.resolve({ data: [], error: null });

  const [requestResult, subscriptionsResult, studentsResult, googleResult] = await Promise.all([
    supabaseAdmin
      .from("account_deletion_requests" as never)
      .select("email_snapshot" as never)
      .eq("id" as never, request.requestId as never)
      .eq("lock_token" as never, request.lockToken as never)
      .maybeSingle(),
    supabaseAdmin
      .from("recurring_subscriptions" as never)
      .select("id,engine,status,mp_preapproval_id" as never)
      .eq("user_id" as never, request.userId as never),
    studentsPromise,
    supabaseAdmin
      .from("coach_google_tokens" as never)
      .select("refresh_token,access_token" as never)
      .eq("user_id" as never, request.userId as never),
  ]);

  if (
    requestResult.error
    || subscriptionsResult.error
    || studentsResult.error
    || googleResult.error
  ) {
    throw deletionError("external_subscriptions", "EXTERNAL_PLAN_LOAD_FAILED", true);
  }

  const payerEmail = normalizeDeletionEmail(
    (requestResult.data as { email_snapshot?: unknown } | null)?.email_snapshot,
  );
  if (!payerEmail) {
    throw deletionError("external_subscriptions", "ACCOUNT_EMAIL_SNAPSHOT_INVALID", false);
  }

  const studentIds = (studentsResult.data ?? []).map((row) => row.id);
  let cards: Array<{
    mp_customer_id?: unknown;
    mp_card_id?: unknown;
  }> = [];
  if (studentIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("saved_payment_cards" as never)
      .select("mp_customer_id,mp_card_id" as never)
      .in("student_id" as never, studentIds as never);
    if (error) throw deletionError("external_cards", "CARD_PLAN_LOAD_FAILED", true);
    cards = (data ?? []) as Array<{ mp_customer_id?: unknown; mp_card_id?: unknown }>;
  }

  const subscriptionRows = (subscriptionsResult.data ?? []) as Array<{
    id?: unknown;
    engine?: unknown;
    status?: unknown;
    mp_preapproval_id?: unknown;
  }>;
  if (subscriptionRows.some((row) => (
    row.engine === "mp_preapproval"
    && row.status !== "cancelled"
    && (typeof row.mp_preapproval_id !== "string" || !row.mp_preapproval_id)
  ))) {
    throw deletionError(
      "external_subscriptions",
      "MP_PREAPPROVAL_REFERENCE_INVALID",
      false,
    );
  }

  const preapprovals = subscriptionRows
    .map((row) => {
      const value = row as { id?: unknown; mp_preapproval_id?: unknown };
      return {
        subscriptionId: typeof value.id === "string" ? value.id : "",
        preapprovalId: typeof value.mp_preapproval_id === "string"
          ? value.mp_preapproval_id
          : "",
        payerEmail,
      };
    })
      .filter((value) => value.subscriptionId && value.preapprovalId);

  const googleTokens = (googleResult.data ?? [])
    .map((row) => {
      const value = row as { refresh_token?: unknown; access_token?: unknown };
      return typeof value.refresh_token === "string" && value.refresh_token
        ? value.refresh_token
        : typeof value.access_token === "string"
          ? value.access_token
          : null;
    })
    .filter((value): value is string => Boolean(value));

  if (cards.some((card) => (
    typeof card.mp_customer_id !== "string"
    || !card.mp_customer_id
    || typeof card.mp_card_id !== "string"
    || !card.mp_card_id
  ))) {
    throw deletionError("external_cards", "MP_CARD_REFERENCE_INVALID", false);
  }

  const plan = {
    preapprovals,
    cards: cards
      .map((card) => ({
        customerId: typeof card.mp_customer_id === "string" ? card.mp_customer_id : "",
        cardId: typeof card.mp_card_id === "string" ? card.mp_card_id : "",
        payerEmail,
      }))
      .filter((card) => card.customerId && card.cardId),
    googleTokens,
  };

  if (
    (plan.preapprovals.length > 0 || plan.cards.length > 0)
    && !process.env.MERCADOPAGO_ACCESS_TOKEN
  ) {
    throw deletionError("external_subscriptions", "MP_NOT_CONFIGURED", false);
  }

  return plan;
}

async function validateExternalPlan(
  request: ClaimedAccountDeletion,
  plan: AccountDeletionExternalPlan,
): Promise<void> {
  const {
    getCustomer,
    getCustomerCard,
    getPreapproval,
    MercadoPagoApiError,
  } = await import("@/server/mercadopago.server");

  for (const preapproval of plan.preapprovals) {
    try {
      const current = await getPreapproval(preapproval.preapprovalId);
      if (!preapprovalMatchesDeletionOwner(current, preapproval)) {
        throw deletionError(
          "external_subscriptions",
          "MP_PREAPPROVAL_OWNERSHIP_MISMATCH",
          false,
        );
      }
    } catch (error) {
      if (error instanceof AccountDeletionProcessorError) throw error;
      if (error instanceof MercadoPagoApiError) {
        if (error.status === 404 || error.status === 410) {
          await heartbeat(request, "preflight");
          continue;
        }
        if (error.status === 401 || error.status === 403) {
          throw deletionError("external_subscriptions", "MP_CONFIGURATION_INVALID", false);
        }
        throw deletionError(
          "external_subscriptions",
          "MP_OWNERSHIP_VALIDATION_FAILED",
          error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500,
        );
      }
      throw deletionError("external_subscriptions", "MP_OWNERSHIP_VALIDATION_FAILED", true);
    }
    await heartbeat(request, "preflight");
  }

  for (const card of plan.cards) {
    try {
      const customer = await getCustomer(card.customerId);
      if (!customerMatchesDeletionOwner(customer, card.payerEmail)) {
        throw deletionError("external_cards", "MP_CUSTOMER_OWNERSHIP_MISMATCH", false);
      }
      const remoteCard = await getCustomerCard(card.customerId, card.cardId);
      if (!cardMatchesDeletionOwner(remoteCard, card.cardId)) {
        throw deletionError("external_cards", "MP_CARD_OWNERSHIP_MISMATCH", false);
      }
    } catch (error) {
      if (error instanceof AccountDeletionProcessorError) throw error;
      if (error instanceof MercadoPagoApiError) {
        if (error.status === 404 || error.status === 410) {
          await heartbeat(request, "preflight");
          continue;
        }
        if (error.status === 401 || error.status === 403) {
          throw deletionError("external_cards", "MP_CONFIGURATION_INVALID", false);
        }
        throw deletionError(
          "external_cards",
          "MP_OWNERSHIP_VALIDATION_FAILED",
          error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500,
        );
      }
      throw deletionError("external_cards", "MP_OWNERSHIP_VALIDATION_FAILED", true);
    }
    await heartbeat(request, "preflight");
  }
}

async function cancelExternalPreapproval(
  preapproval: AccountDeletionExternalPlan["preapprovals"][number],
): Promise<void> {
  const {
    cancelPreapproval,
    getPreapproval,
    MercadoPagoApiError,
  } = await import("@/server/mercadopago.server");

  try {
    const current = await getPreapproval(preapproval.preapprovalId);
    if (!preapprovalMatchesDeletionOwner(current, preapproval)) {
      throw deletionError("external_subscriptions", "MP_PREAPPROVAL_OWNERSHIP_MISMATCH", false);
    }
    if (current?.status === "cancelled") return;

    const cancelled = await cancelPreapproval(preapproval.preapprovalId);
    if (cancelled?.status === "cancelled") return;

    const confirmed = await getPreapproval(preapproval.preapprovalId);
    if (confirmed?.status !== "cancelled") {
      throw deletionError("external_subscriptions", "MP_CANCELLATION_NOT_CONFIRMED", true);
    }
  } catch (error) {
    if (error instanceof AccountDeletionProcessorError) throw error;
    if (error instanceof MercadoPagoApiError) {
      if (error.status === 404 || error.status === 410) return;
      if (error.status === 401 || error.status === 403) {
        throw deletionError("external_subscriptions", "MP_CONFIGURATION_INVALID", false);
      }
      throw deletionError(
        "external_subscriptions",
        "MP_CANCELLATION_FAILED",
        error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500,
      );
    }
    if (error instanceof Error && /MERCADOPAGO_ACCESS_TOKEN/.test(error.message)) {
      throw deletionError("external_subscriptions", "MP_NOT_CONFIGURED", false);
    }
    throw deletionError("external_subscriptions", "MP_CANCELLATION_FAILED", true);
  }
}

async function removeExternalCard(
  card: AccountDeletionExternalPlan["cards"][number],
): Promise<void> {
  const {
    deleteCustomerCard,
    getCustomer,
    getCustomerCard,
    MercadoPagoApiError,
  } = await import("@/server/mercadopago.server");
  try {
    const customer = await getCustomer(card.customerId);
    if (!customerMatchesDeletionOwner(customer, card.payerEmail)) {
      throw deletionError("external_cards", "MP_CUSTOMER_OWNERSHIP_MISMATCH", false);
    }

    const remoteCard = await getCustomerCard(card.customerId, card.cardId);
    if (!cardMatchesDeletionOwner(remoteCard, card.cardId)) {
      throw deletionError("external_cards", "MP_CARD_OWNERSHIP_MISMATCH", false);
    }

    await deleteCustomerCard(card.customerId, card.cardId);
    try {
      await getCustomerCard(card.customerId, card.cardId);
      throw deletionError("external_cards", "MP_CARD_REMOVAL_NOT_CONFIRMED", true);
    } catch (confirmationError) {
      if (
        confirmationError instanceof MercadoPagoApiError
        && (confirmationError.status === 404 || confirmationError.status === 410)
      ) return;
      throw confirmationError;
    }
  } catch (error) {
    if (error instanceof AccountDeletionProcessorError) throw error;
    if (error instanceof MercadoPagoApiError) {
      if (error.status === 404 || error.status === 410) return;
      if (error.status === 401 || error.status === 403) {
        throw deletionError("external_cards", "MP_CONFIGURATION_INVALID", false);
      }
      throw deletionError(
        "external_cards",
        "MP_CARD_REMOVAL_FAILED",
        error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500,
      );
    }
    if (error instanceof Error && /MERCADOPAGO_ACCESS_TOKEN/.test(error.message)) {
      throw deletionError("external_cards", "MP_NOT_CONFIGURED", false);
    }
    throw deletionError("external_cards", "MP_CARD_REMOVAL_FAILED", true);
  }
}

async function revokeGoogleToken(token: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw deletionError("external_google", "GOOGLE_REVOCATION_UNAVAILABLE", true);
  }

  // Google returns 400 for an already invalid/revoked token; that is terminal
  // for deletion. A 404 is an endpoint failure and must not pass as success.
  if (response.ok || response.status === 400) return;
  if (response.status === 401 || response.status === 403) {
    throw deletionError("external_google", "GOOGLE_REVOCATION_FORBIDDEN", false);
  }
  throw deletionError(
    "external_google",
    "GOOGLE_REVOCATION_FAILED",
    response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500,
  );
}

async function heartbeat(
  request: ClaimedAccountDeletion,
  stage: AccountDeletionStage,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    "account_deletion_heartbeat" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
      _stage: stage,
    } as never,
  );
  if (error) throw deletionError(stage, "PROCESSOR_LEASE_LOST", true);
}

async function loadStorageObjects(
  request: ClaimedAccountDeletion,
): Promise<AccountDeletionStorageObject[]> {
  const pageSize = 500;
  const objects: AccountDeletionStorageObject[] = [];
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabaseAdmin.rpc(
      "account_deletion_storage_manifest" as never,
      {
        _request_id: request.requestId,
        _lock_token: request.lockToken,
        _limit: pageSize,
        _offset: offset,
      } as never,
    );
    if (error) throw deletionError("storage", "STORAGE_MANIFEST_FAILED", true);
    if (!Array.isArray(data)) {
      throw deletionError("storage", "STORAGE_MANIFEST_RESPONSE_INVALID", false);
    }
    const page = data as StorageManifestRow[];
    for (const row of page) {
      if (typeof row.bucket_id !== "string" || typeof row.name !== "string") {
        throw deletionError("storage", "STORAGE_MANIFEST_RESPONSE_INVALID", false);
      }
      objects.push({ bucketId: row.bucket_id, name: row.name });
    }
    if (page.length < pageSize) return objects;
    await heartbeat(request, "storage");
  }
  throw deletionError("storage", "STORAGE_MANIFEST_TOO_LARGE", false);
}

async function removeStorageObjects(
  request: ClaimedAccountDeletion,
  objects: AccountDeletionStorageObject[],
): Promise<number> {
  const byBucket = new Map<string, Set<string>>();
  for (const object of objects) {
    if (!object.bucketId || !object.name) continue;
    const names = byBucket.get(object.bucketId) ?? new Set<string>();
    names.add(object.name);
    byBucket.set(object.bucketId, names);
  }

  let removed = 0;
  for (const [bucketId, namesSet] of byBucket) {
    const names = [...namesSet];
    for (let index = 0; index < names.length; index += 100) {
      const batch = names.slice(index, index + 100);
      const { error } = await supabaseAdmin.storage.from(bucketId).remove(batch);
      if (error) throw deletionError("storage", "STORAGE_REMOVAL_FAILED", true);
      removed += batch.length;
      await heartbeat(request, "storage");
    }
  }
  return removed;
}

async function anonymizeDatabase(
  request: ClaimedAccountDeletion,
): Promise<Record<string, number | boolean | string>> {
  const { data, error } = await supabaseAdmin.rpc(
    "account_deletion_anonymize" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
    } as never,
  );
  if (error) throw deletionError("database", "DATABASE_ANONYMIZATION_FAILED", true);
  const parsed = anonymizationSchema.safeParse(data);
  if (!parsed.success) {
    throw deletionError("database", "DATABASE_ANONYMIZATION_RESPONSE_INVALID", false);
  }
  const summary: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      summary[key] = value;
    }
  }
  return summary;
}

async function deleteAuthIdentity(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) {
    if (authResourceMissing(error)) return;
    throw deletionError("auth_identity", "AUTH_LOOKUP_FAILED", true);
  }
  if (!data.user) return;

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
  if (deleteError && !authResourceMissing(deleteError)) {
    throw deletionError("auth_identity", "AUTH_DELETE_FAILED", true);
  }
}

async function complete(
  request: ClaimedAccountDeletion,
  summary: AccountDeletionRetentionSummary,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    "account_deletion_complete" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
      _retention_summary: summary,
    } as never,
  );
  if (error) throw deletionError("complete", "COMPLETION_AUDIT_FAILED", true);
}

function dependencies(): AccountDeletionProcessorDependencies {
  return {
    setStage,
    heartbeat,
    preflight,
    freezeBilling,
    lockIdentity,
    loadExternalPlan,
    validateExternalPlan,
    cancelPreapproval: cancelExternalPreapproval,
    removeCard: removeExternalCard,
    revokeGoogleToken,
    loadStorageObjects,
    removeStorageObjects,
    anonymizeDatabase,
    deleteAuthIdentity,
    complete,
  };
}

function claimedRequest(row: ClaimedRow): ClaimedAccountDeletion {
  return {
    requestId: row.request_id,
    userId: row.subject_user_id,
    profileId: row.subject_profile_id,
    lockToken: row.lock_token,
    attemptCount: row.attempt_count,
  };
}

async function markFailure(
  request: ClaimedAccountDeletion,
  failure: AccountDeletionProcessorError,
): Promise<"retry" | "blocked"> {
  const { data, error } = await supabaseAdmin.rpc(
    "account_deletion_mark_failure" as never,
    {
      _request_id: request.requestId,
      _lock_token: request.lockToken,
      _stage: failure.stage,
      _error_code: failure.code,
      _retryable: failure.retryable,
    } as never,
  );
  if (error) {
    console.error("[account-deletion] failed to persist processor failure", {
      requestId: request.requestId,
      code: failure.code,
    });
    return "blocked";
  }
  return data === "retry" ? "retry" : "blocked";
}

export async function runAccountDeletionBatch(input: {
  limit?: number;
  requestId?: string;
  retryBlocked?: boolean;
}): Promise<AccountDeletionBatchSummary> {
  const limit = Math.min(10, Math.max(1, Math.trunc(input.limit ?? 3)));

  if (input.retryBlocked) {
    if (!input.requestId) throw new Error("requestId é obrigatório para reprocessar um bloqueio.");
    const { error } = await supabaseAdmin.rpc(
      "account_deletion_reset_blocked" as never,
      { _request_id: input.requestId } as never,
    );
    if (error) throw new Error("Não foi possível liberar a solicitação bloqueada.");
  }

  const { data, error } = await supabaseAdmin.rpc(
    "claim_account_deletion_requests" as never,
    {
      _limit: limit,
      _request_id: input.requestId ?? null,
    } as never,
  );
  if (error) throw new Error("Não foi possível reservar solicitações de exclusão.");

  const rows = (data ?? []) as ClaimedRow[];
  const summary: AccountDeletionBatchSummary = {
    claimed: rows.length,
    completed: 0,
    retry: 0,
    blocked: 0,
    results: [],
  };

  for (const row of rows) {
    const request = claimedRequest(row);
    try {
      await processClaimedAccountDeletion(request, dependencies());
      summary.completed += 1;
      summary.results.push({ requestId: request.requestId, outcome: "completed" });
    } catch (error) {
      const failure = error instanceof AccountDeletionProcessorError
        ? error
        : deletionError("database", "UNEXPECTED_PROCESSOR_ERROR", true);
      const outcome = await markFailure(request, failure);
      summary[outcome] += 1;
      summary.results.push({
        requestId: request.requestId,
        outcome,
        errorCode: failure.code,
      });
    }
  }

  return summary;
}
