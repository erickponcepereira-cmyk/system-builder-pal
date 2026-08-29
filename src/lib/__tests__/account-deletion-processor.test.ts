import { describe, expect, it, vi } from "vitest";
import {
  AccountDeletionProcessorError,
  cardMatchesDeletionOwner,
  customerMatchesDeletionOwner,
  preapprovalMatchesDeletionOwner,
  processClaimedAccountDeletion,
  safeSecretEqual,
  type AccountDeletionProcessorDependencies,
  type ClaimedAccountDeletion,
} from "../account-deletion-processor-core";

const request: ClaimedAccountDeletion = {
  requestId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  profileId: "33333333-3333-4333-8333-333333333333",
  lockToken: "44444444-4444-4444-8444-444444444444",
  attemptCount: 1,
};

function dependencies(overrides: Partial<AccountDeletionProcessorDependencies> = {}) {
  const calls: string[] = [];
  let planLoads = 0;
  const deps: AccountDeletionProcessorDependencies = {
    setStage: vi.fn(async (_request, stage) => { calls.push(`stage:${stage}`); }),
    heartbeat: vi.fn(async () => undefined),
    preflight: vi.fn(async () => ({ blockers: [] })),
    freezeBilling: vi.fn(async () => { calls.push("freeze"); }),
    lockIdentity: vi.fn(async () => { calls.push("lock"); }),
    loadExternalPlan: vi.fn(async () => {
      planLoads += 1;
      calls.push(`plan:${planLoads}`);
      return {
        preapprovals: [
          { preapprovalId: "pre-1", subscriptionId: "sub-1", payerEmail: "test@example.com" },
          { preapprovalId: "pre-1", subscriptionId: "sub-1", payerEmail: "test@example.com" },
        ],
        cards: [
          { customerId: "customer-1", cardId: "card-1", payerEmail: "test@example.com" },
          { customerId: "customer-1", cardId: "card-1", payerEmail: "test@example.com" },
        ],
        googleTokens: ["google-1", "google-1"],
      };
    }),
    validateExternalPlan: vi.fn(async () => { calls.push("validate"); }),
    cancelPreapproval: vi.fn(async () => { calls.push("preapproval"); }),
    removeCard: vi.fn(async () => { calls.push("card"); }),
    revokeGoogleToken: vi.fn(async () => { calls.push("google"); }),
    loadStorageObjects: vi.fn()
      .mockResolvedValueOnce([{ bucketId: "avatars", name: "photo.jpg" }])
      .mockResolvedValue([]),
    removeStorageObjects: vi.fn(async () => { calls.push("storage"); return 1; }),
    anonymizeDatabase: vi.fn(async () => { calls.push("database"); return { profiles: 1 }; }),
    deleteAuthIdentity: vi.fn(async () => { calls.push("auth"); }),
    complete: vi.fn(async () => { calls.push("complete"); }),
    ...overrides,
  };
  return { calls, deps };
}

describe("account deletion processor", () => {
  it("runs destructive steps in order and deduplicates external resources", async () => {
    const { calls, deps } = dependencies();
    const summary = await processClaimedAccountDeletion(request, deps);

    expect(calls).toEqual([
      "stage:preflight",
      "plan:1",
      "validate",
      "stage:freeze_billing",
      "freeze",
      "stage:lock_identity",
      "lock",
      "plan:2",
      "stage:external_subscriptions",
      "preapproval",
      "stage:external_cards",
      "card",
      "stage:external_google",
      "google",
      "stage:storage",
      "storage",
      "stage:database",
      "database",
      "stage:auth_identity",
      "auth",
      "stage:storage_verify",
      "stage:database_verify",
      "database",
      "stage:complete",
      "complete",
    ]);
    expect(summary).toMatchObject({
      preapprovalsCancelled: 1,
      cardsRemoved: 1,
      googleGrantsRevoked: 1,
      storageObjectsRemoved: 1,
    });
  });

  it("stops before any destructive step when preflight is blocked", async () => {
    const { deps } = dependencies({
      preflight: vi.fn(async () => ({ blockers: ["FINANCIAL_SETTLEMENT_REQUIRED"] })),
    });

    await expect(processClaimedAccountDeletion(request, deps)).rejects.toMatchObject({
      stage: "preflight",
      code: "FINANCIAL_SETTLEMENT_REQUIRED",
      retryable: false,
    });
    expect(deps.lockIdentity).not.toHaveBeenCalled();
    expect(deps.freezeBilling).not.toHaveBeenCalled();
    expect(deps.anonymizeDatabase).not.toHaveBeenCalled();
    expect(deps.deleteAuthIdentity).not.toHaveBeenCalled();
  });

  it("blocks local and Auth deletion when Storage is not empty after removal", async () => {
    const { deps } = dependencies({
      loadStorageObjects: vi.fn(async () => [{ bucketId: "avatars", name: "late.jpg" }]),
    });

    await expect(processClaimedAccountDeletion(request, deps)).rejects.toMatchObject({
      code: "STORAGE_NOT_EMPTY",
      retryable: true,
    });
    expect(deps.anonymizeDatabase).not.toHaveBeenCalled();
    expect(deps.deleteAuthIdentity).not.toHaveBeenCalled();
  });

  it("never deletes local data or Auth when an external cancellation fails", async () => {
    const { deps } = dependencies({
      cancelPreapproval: vi.fn(async () => {
        throw new AccountDeletionProcessorError("external_subscriptions", "MP_UNAVAILABLE", true);
      }),
    });

    await expect(processClaimedAccountDeletion(request, deps)).rejects.toMatchObject({
      code: "MP_UNAVAILABLE",
      retryable: true,
    });
    expect(deps.removeStorageObjects).not.toHaveBeenCalled();
    expect(deps.anonymizeDatabase).not.toHaveBeenCalled();
    expect(deps.deleteAuthIdentity).not.toHaveBeenCalled();
  });

  it("does not lock the identity when billing cannot be frozen", async () => {
    const { deps } = dependencies({
      freezeBilling: vi.fn(async () => {
        throw new AccountDeletionProcessorError(
          "freeze_billing",
          "PAYMENT_RECONCILIATION_REQUIRED",
          false,
        );
      }),
    });

    await expect(processClaimedAccountDeletion(request, deps)).rejects.toMatchObject({
      stage: "freeze_billing",
      code: "PAYMENT_RECONCILIATION_REQUIRED",
    });
    expect(deps.lockIdentity).not.toHaveBeenCalled();
    expect(deps.cancelPreapproval).not.toHaveBeenCalled();
  });

  it("does not freeze or lock an account when external ownership is invalid", async () => {
    const { deps } = dependencies({
      validateExternalPlan: vi.fn(async () => {
        throw new AccountDeletionProcessorError(
          "external_subscriptions",
          "MP_PREAPPROVAL_OWNERSHIP_MISMATCH",
          false,
        );
      }),
    });

    await expect(processClaimedAccountDeletion(request, deps)).rejects.toMatchObject({
      code: "MP_PREAPPROVAL_OWNERSHIP_MISMATCH",
    });
    expect(deps.freezeBilling).not.toHaveBeenCalled();
    expect(deps.lockIdentity).not.toHaveBeenCalled();
  });

  it("compares processor secrets without early-returning on contents", () => {
    expect(safeSecretEqual("a".repeat(32), "a".repeat(32))).toBe(true);
    expect(safeSecretEqual("a".repeat(32), `${"a".repeat(31)}b`)).toBe(false);
    expect(safeSecretEqual("short", "longer")).toBe(false);
  });

  it("validates Mercado Pago ownership before destructive calls", () => {
    expect(preapprovalMatchesDeletionOwner(
      { external_reference: "recurring:sub-1", payer_email: " Test@Example.com " },
      { subscriptionId: "sub-1", payerEmail: "test@example.com" },
    )).toBe(true);
    expect(preapprovalMatchesDeletionOwner(
      { external_reference: "recurring:other", payer_email: "test@example.com" },
      { subscriptionId: "sub-1", payerEmail: "test@example.com" },
    )).toBe(false);
    expect(customerMatchesDeletionOwner(
      { email: "test@example.com" },
      "TEST@example.com",
    )).toBe(true);
    expect(cardMatchesDeletionOwner({ id: "card-1" }, "card-1")).toBe(true);
    expect(cardMatchesDeletionOwner({ id: "card-2" }, "card-1")).toBe(false);
  });
});
