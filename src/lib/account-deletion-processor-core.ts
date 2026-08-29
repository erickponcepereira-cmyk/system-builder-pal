export type AccountDeletionStage =
  | "preflight"
  | "freeze_billing"
  | "lock_identity"
  | "external_subscriptions"
  | "external_cards"
  | "external_google"
  | "storage"
  | "database"
  | "auth_identity"
  | "storage_verify"
  | "database_verify"
  | "complete";

export type ClaimedAccountDeletion = {
  requestId: string;
  userId: string;
  profileId: string | null;
  lockToken: string;
  attemptCount: number;
};

export type AccountDeletionPreflight = {
  blockers: string[];
};

export type AccountDeletionExternalPlan = {
  preapprovals: Array<{
    preapprovalId: string;
    subscriptionId: string;
    payerEmail: string;
  }>;
  cards: Array<{
    customerId: string;
    cardId: string;
    payerEmail: string;
  }>;
  googleTokens: string[];
};

export type AccountDeletionStorageObject = {
  bucketId: string;
  name: string;
};

export type AccountDeletionRetentionSummary = {
  processorVersion: number;
  preapprovalsCancelled: number;
  cardsRemoved: number;
  googleGrantsRevoked: number;
  storageObjectsRemoved: number;
  database: Record<string, number | boolean | string>;
};

export class AccountDeletionProcessorError extends Error {
  readonly stage: AccountDeletionStage;
  readonly code: string;
  readonly retryable: boolean;

  constructor(stage: AccountDeletionStage, code: string, retryable: boolean) {
    super(code);
    this.name = "AccountDeletionProcessorError";
    this.stage = stage;
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AccountDeletionProcessorDependencies {
  setStage(
    request: ClaimedAccountDeletion,
    stage: AccountDeletionStage,
    metadata?: Record<string, number | boolean | string>,
  ): Promise<void>;
  heartbeat(
    request: ClaimedAccountDeletion,
    stage: AccountDeletionStage,
  ): Promise<void>;
  preflight(request: ClaimedAccountDeletion): Promise<AccountDeletionPreflight>;
  freezeBilling(request: ClaimedAccountDeletion): Promise<void>;
  lockIdentity(request: ClaimedAccountDeletion): Promise<void>;
  loadExternalPlan(request: ClaimedAccountDeletion): Promise<AccountDeletionExternalPlan>;
  validateExternalPlan(
    request: ClaimedAccountDeletion,
    plan: AccountDeletionExternalPlan,
  ): Promise<void>;
  cancelPreapproval(
    preapproval: AccountDeletionExternalPlan["preapprovals"][number],
  ): Promise<void>;
  removeCard(card: AccountDeletionExternalPlan["cards"][number]): Promise<void>;
  revokeGoogleToken(token: string): Promise<void>;
  loadStorageObjects(request: ClaimedAccountDeletion): Promise<AccountDeletionStorageObject[]>;
  removeStorageObjects(
    request: ClaimedAccountDeletion,
    objects: AccountDeletionStorageObject[],
  ): Promise<number>;
  anonymizeDatabase(
    request: ClaimedAccountDeletion,
  ): Promise<Record<string, number | boolean | string>>;
  deleteAuthIdentity(userId: string): Promise<void>;
  complete(
    request: ClaimedAccountDeletion,
    summary: AccountDeletionRetentionSummary,
  ): Promise<void>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueCards(
  cards: AccountDeletionExternalPlan["cards"],
): AccountDeletionExternalPlan["cards"] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = `${card.customerId}:${card.cardId}`;
    if (!card.customerId || !card.cardId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniquePreapprovals(
  preapprovals: AccountDeletionExternalPlan["preapprovals"],
): AccountDeletionExternalPlan["preapprovals"] {
  const seen = new Set<string>();
  return preapprovals.filter((preapproval) => {
    if (
      !preapproval.preapprovalId
      || !preapproval.subscriptionId
      || !preapproval.payerEmail
      || seen.has(preapproval.preapprovalId)
    ) return false;
    seen.add(preapproval.preapprovalId);
    return true;
  });
}

export async function processClaimedAccountDeletion(
  request: ClaimedAccountDeletion,
  dependencies: AccountDeletionProcessorDependencies,
): Promise<AccountDeletionRetentionSummary> {
  await dependencies.setStage(request, "preflight");
  const preflight = await dependencies.preflight(request);
  if (preflight.blockers.length > 0) {
    throw new AccountDeletionProcessorError(
      "preflight",
      preflight.blockers[0] || "PREFLIGHT_BLOCKED",
      false,
    );
  }

  // Fail before freezing when required provider configuration is absent. The
  // authoritative plan is reloaded only after local billing has been frozen.
  const initialPlan = await dependencies.loadExternalPlan(request);
  await dependencies.validateExternalPlan(request, initialPlan);

  await dependencies.setStage(request, "freeze_billing");
  await dependencies.freezeBilling(request);

  await dependencies.setStage(request, "lock_identity");
  await dependencies.lockIdentity(request);

  const plan = await dependencies.loadExternalPlan(request);
  const preapprovals = uniquePreapprovals(plan.preapprovals);
  const cards = uniqueCards(plan.cards);
  const googleTokens = unique(plan.googleTokens);

  await dependencies.setStage(request, "external_subscriptions", {
    count: preapprovals.length,
  });
  for (const preapproval of preapprovals) {
    await dependencies.cancelPreapproval(preapproval);
    await dependencies.heartbeat(request, "external_subscriptions");
  }

  await dependencies.setStage(request, "external_cards", { count: cards.length });
  for (const card of cards) {
    await dependencies.removeCard(card);
    await dependencies.heartbeat(request, "external_cards");
  }

  await dependencies.setStage(request, "external_google", {
    count: googleTokens.length,
  });
  for (const token of googleTokens) {
    await dependencies.revokeGoogleToken(token);
    await dependencies.heartbeat(request, "external_google");
  }

  await dependencies.setStage(request, "storage");
  const storageObjects = await dependencies.loadStorageObjects(request);
  let storageObjectsRemoved = storageObjects.length > 0
    ? await dependencies.removeStorageObjects(request, storageObjects)
    : 0;
  const remainingStorageObjects = await dependencies.loadStorageObjects(request);
  if (remainingStorageObjects.length > 0) {
    throw new AccountDeletionProcessorError("storage", "STORAGE_NOT_EMPTY", true);
  }

  await dependencies.setStage(request, "database", {
    storageObjectsRemoved,
  });
  const database = await dependencies.anonymizeDatabase(request);

  await dependencies.setStage(request, "auth_identity");
  await dependencies.deleteAuthIdentity(request.userId);

  await dependencies.setStage(request, "storage_verify");
  const lateStorageObjects = await dependencies.loadStorageObjects(request);
  if (lateStorageObjects.length > 0) {
    storageObjectsRemoved += await dependencies.removeStorageObjects(
      request,
      lateStorageObjects,
    );
  }
  if ((await dependencies.loadStorageObjects(request)).length > 0) {
    throw new AccountDeletionProcessorError("storage_verify", "STORAGE_NOT_EMPTY", true);
  }

  // Sweep once more after Auth removal. Existing signed JWTs can outlive the
  // identity row briefly; without a second pass they could race the first sweep.
  await dependencies.setStage(request, "database_verify");
  const verificationDatabase = await dependencies.anonymizeDatabase(request);

  const summary: AccountDeletionRetentionSummary = {
    processorVersion: 1,
    preapprovalsCancelled: preapprovals.length,
    cardsRemoved: cards.length,
    googleGrantsRevoked: googleTokens.length,
    storageObjectsRemoved,
    database: {
      ...database,
      verificationPass: true,
      verificationProfilesAnonymized:
        typeof verificationDatabase.profilesAnonymized === "number"
          ? verificationDatabase.profilesAnonymized
          : 0,
    },
  };

  await dependencies.setStage(request, "complete");
  await dependencies.complete(request, summary);
  return summary;
}

export function processorError(
  stage: AccountDeletionStage,
  error: unknown,
): AccountDeletionProcessorError {
  if (error instanceof AccountDeletionProcessorError) return error;
  return new AccountDeletionProcessorError(stage, "UNEXPECTED_PROCESSOR_ERROR", true);
}

export function safeSecretEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function normalizeDeletionEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function preapprovalMatchesDeletionOwner(
  value: unknown,
  expected: { subscriptionId: string; payerEmail: string },
): boolean {
  const record = objectRecord(value);
  return Boolean(
    record
    && record.external_reference === `recurring:${expected.subscriptionId}`
    && normalizeDeletionEmail(record.payer_email) === normalizeDeletionEmail(expected.payerEmail)
    && normalizeDeletionEmail(expected.payerEmail),
  );
}

export function customerMatchesDeletionOwner(value: unknown, payerEmail: string): boolean {
  const record = objectRecord(value);
  return Boolean(
    record
    && normalizeDeletionEmail(record.email) === normalizeDeletionEmail(payerEmail)
    && normalizeDeletionEmail(payerEmail),
  );
}

export function cardMatchesDeletionOwner(value: unknown, cardId: string): boolean {
  const record = objectRecord(value);
  return Boolean(record && cardId && String(record.id ?? "") === cardId);
}
