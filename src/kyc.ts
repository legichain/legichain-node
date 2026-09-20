import type { Legichain } from "./client.js";
import type {
  KycDocumentSubmit, KycSelfieSubmit, KycNfcSubmit, KycLivenessSubmit,
  OperationStatus,
} from "./types.js";

export interface KycEvidence {
  documents: KycDocumentSubmit;
  selfie: KycSelfieSubmit;
  nfc: KycNfcSubmit;
  liveness: KycLivenessSubmit;
}

export class KycOperationError extends Error {
  constructor(readonly operation: OperationStatus) {
    super(`KYC operation ${operation.id} ${operation.status}: ${operation.error_code ?? "unknown"}`);
  }
}

/** A backend-side session. The application token is managed internally. */
export class KycSession {
  readonly #client: Legichain;
  readonly #token: string;
  readonly #operations = new Set<string>();
  constructor(client: Legichain, readonly applicationId: string, clientToken: string) {
    this.#client = client;
    this.#token = clientToken;
  }

  async evidence<K extends keyof KycEvidence>(step: K, body: KycEvidence[K], idempotencyKey: string) {
    const receipt = await this.#client.operations.kycEvidence(
      this.applicationId, step, { ...body }, idempotencyKey, this.#token,
    );
    this.#operations.add(receipt.operation_id);
    return receipt;
  }

  challenge(options: { length?: number; ttl_seconds?: number } = {}) {
    return this.#client.kyc.livenessChallenge(this.applicationId, this.#token,
      { length: 3, ttl_seconds: 120, ...options });
  }

  status() { return this.#client.kyc.status(this.applicationId); }

  /** Polls evidence processing only. It never polls for an identity approval. */
  async wait(operationId: string, options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {}) {
    if (!this.#operations.has(operationId)) throw new Error("Operation does not belong to this SDK session");
    const timeout = options.timeoutMs ?? 120_000;
    const interval = options.intervalMs ?? 1000;
    if (timeout <= 0 || interval <= 0) throw new Error("Polling limits must be positive");
    const deadline = Date.now() + timeout;
    for (;;) {
      options.signal?.throwIfAborted();
      const operation = await this.#client.operations.get(operationId);
      if (operation.status === "completed") return operation;
      if (["failed", "expired", "cancelled"].includes(operation.status)) throw new KycOperationError(operation);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Operation ${operationId} is still processing; keep its receipt`);
      await new Promise<void>((resolve, reject) => {
        const finish = () => { options.signal?.removeEventListener("abort", abort); resolve(); };
        const timer = setTimeout(finish, Math.min(interval, remaining));
        const abort = () => { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); reject(options.signal?.reason); };
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
      });
    }
  }

  /** Call after uploads; the final business result is delivered by webhook. */
  async submit() {
    for (const id of this.#operations) {
      const operation = await this.#client.operations.get(id);
      if (["failed", "expired", "cancelled"].includes(operation.status)) throw new KycOperationError(operation);
      if (operation.status !== "completed") throw new Error("Evidence is still processing; wait before submitting");
    }
    return this.#client.kyc.submit(this.applicationId, this.#token);
  }
}
