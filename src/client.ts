import { LegichainError, LegichainNetworkError } from "./errors.js";
import type {
  BatchAsyncResponse, BatchItem, CompanyQuery, CryptoQuery, JobStatus,
  PersonQuery, ScreeningResponse, StatusPayload,
} from "./types.js";

export interface ClientOptions {
  /** API key in either `lc_live_…sk_live_…` (bearer) form or just the
   *  bearer string returned by /bootstrap. Required. */
  apiKey: string;
  /** API base URL. Defaults to https://api.legichain.com, which is the
   *  control plane and knows where to send you. Set this only to pin a
   *  region deliberately or to point at a staging host. */
  baseUrl?: string;
  /** Region code, e.g. `"eu"` or `"tr"`. When given without `baseUrl`
   *  the client starts at that region's host, saving one redirect on
   *  the first call. Usually unnecessary — see `region` on the client,
   *  which is filled in the moment the account's region is learned. */
  region?: string;
  /** Request timeout in ms. Defaults to 30 000. */
  timeoutMs?: number;
  /** Custom fetch — useful for tests or non-Node runtimes. Defaults to
   *  the global `fetch` (Node 18+, browsers). */
  fetch?: typeof fetch;
  /** Extra headers added to every request. */
  defaultHeaders?: Record<string, string>;
}

interface RequestOptions {
  idem?:        string;
  /** Force the response to be returned as a Blob (PDF reports). */
  binary?:      boolean;
  /** Override the request body's Content-Type. */
  contentType?: string;
  /** Override Accept. */
  accept?:      string;
  /** Per-KYC-application short-lived token issued by
   *  `POST /v1/kyc/applications`. Required on every artefact endpoint
   *  (documents / nfc / selfie / liveness / submit / retry / extend-ttl)
   *  and on every AV per-verification endpoint. */
  clientToken?: string;
}

const DEFAULT_BASE = "https://api.legichain.com";
const SDK_UA       = "legichain-node/0.1.0";

/** Where a region answers, when all we have is its code. The API
 *  publishes the real host in the 421 it sends, and that is preferred;
 *  this is the fallback for a reply that names a region and nothing
 *  else. */
const regionHost = (code: string) => `https://${code}-api.legichain.com`;

/** The API refuses a call for an account it does not serve. */
const WRONG_REGION = "REG_001_WRONG_REGION";


/** Sync-style client built on the global fetch API. Every method is
 *  async; the SDK does not maintain a connection pool — Node's
 *  undici handles HTTP keep-alive transparently. */
export class Legichain {
  readonly timeoutMs: number;

  #base:   string;
  #region: string | null;
  readonly #apiKey:  string;
  readonly #fetch:   typeof fetch;
  readonly #headers: Record<string, string>;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) {
      throw new Error("legichain: apiKey is required");
    }
    this.#apiKey   = opts.apiKey;
    this.#region   = opts.region ?? null;
    this.#base     = (
      opts.baseUrl ?? (opts.region ? regionHost(opts.region) : DEFAULT_BASE)
    ).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.#fetch    = opts.fetch ?? globalThis.fetch;
    this.#headers  = {
      "User-Agent":   SDK_UA,
      "Accept":       "application/json",
      ...(opts.defaultHeaders ?? {}),
    };
    if (typeof this.#fetch !== "function") {
      throw new Error(
        "legichain: no fetch available — pass `fetch` in options or upgrade to Node 18+.",
      );
    }
  }

  /** The host this client is currently talking to. Changes by itself
   *  the first time the API says the account lives somewhere else. */
  get baseUrl(): string {
    return this.#base;
  }

  /** The region serving this account, once it is known — `null` until
   *  the first call, unless it was passed to the constructor. */
  get region(): string | null {
    return this.#region;
  }

  /** Explicit queued operations. A 202 receipt is not a completed result. */
  readonly operations = {
    screen: (kind: "person" | "company" | "crypto" | "batch", body: PersonQuery | CompanyQuery | CryptoQuery | {items: BatchItem[]}, idempotencyKey: string) =>
      this.#enqueueOperation(`/v2/screen/${kind}`, body, idempotencyKey),
    report: (kind: "person" | "company" | "wallet", body: Record<string, unknown>, idempotencyKey: string) =>
      this.#enqueueOperation(`/v2/reports/${kind}`, body, idempotencyKey),
    kycReport: (id: string, body: {decision_id: string; format?: "json" | "pdf"}, idempotencyKey: string) =>
      this.#enqueueOperation(`/v2/reports/kyc/${encodeURIComponent(id)}`, body, idempotencyKey),
    kycEvidence: (id: string, step: "documents" | "selfie" | "liveness" | "nfc", body: Record<string, unknown>, idempotencyKey: string, clientToken?: string) =>
      this.#enqueueOperation(`/v2/kyc/applications/${encodeURIComponent(id)}/${step}`, body, idempotencyKey, clientToken),
    addressSubmit: (id: string, idempotencyKey: string, notes?: string) =>
      this.#enqueueOperation(`/v2/address-verifications/${encodeURIComponent(id)}/submit`, {notes}, idempotencyKey),
    get: (id: string): Promise<import("./types.js").OperationStatus> => this.#get(`/v2/operations/${encodeURIComponent(id)}`),
    task: (id: string, taskId: string): Promise<import("./types.js").OperationTaskResult> =>
      this.#get(`/v2/operations/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}`),
    list: (options: {cursor?: string; state?: import("./types.js").OperationState; limit?: number} = {}): Promise<import("./types.js").OperationPage> => {
      const query = new URLSearchParams(Object.entries(options).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)] as [string,string]));
      return this.#get(`/v2/operations?${query}`);
    },
    cancel: (id: string): Promise<import("./types.js").OperationStatus> => this.#post(`/v2/operations/${encodeURIComponent(id)}/cancel`, {}),
  };

  async #enqueueOperation(path: string, body: unknown, key: string, clientToken?: string): Promise<import("./types.js").OperationAccepted> {
    if (typeof key !== "string" || new TextEncoder().encode(key).length < 1 || new TextEncoder().encode(key).length > 256)
      throw new Error("An explicit 1–256 byte idempotency key is required");
    return this.#post(path, body, {idem:key,clientToken});
  }

  // ── screening ──────────────────────────────────────────────────────
  readonly screen = {
    person:  (q: PersonQuery,  opts?: RequestOptions): Promise<ScreeningResponse> =>
      this.#post("/v1/screen/person",  q, opts),
    company: (q: CompanyQuery, opts?: RequestOptions): Promise<ScreeningResponse> =>
      this.#post("/v1/screen/company", q, opts),
    crypto:  (q: CryptoQuery,  opts?: RequestOptions): Promise<ScreeningResponse> =>
      this.#post("/v1/screen/crypto",  q, opts),
    batch:   (items: BatchItem[], opts?: RequestOptions): Promise<ScreeningResponse[]> =>
      this.#post("/v1/screen/batch",   { items }, opts),
    batchAsync: (items: BatchItem[], opts?: RequestOptions): Promise<BatchAsyncResponse> =>
      this.#post("/v1/screen/batch/async", { items }, opts),
    job: (jobId: string): Promise<JobStatus> =>
      this.#get(`/v1/screen/jobs/${encodeURIComponent(jobId)}`),
  };

  // ── reports ────────────────────────────────────────────────────────
  readonly reports = {
    wallet:  (q: CryptoQuery,  opts?: RequestOptions) => this.#reportPdf("/v1/reports/wallet",  q, opts),
    person:  (q: PersonQuery,  opts?: RequestOptions) => this.#reportPdf("/v1/reports/person",  q, opts),
    company: (q: CompanyQuery, opts?: RequestOptions) => this.#reportPdf("/v1/reports/company", q, opts),
  };

  // ── KYC SDK surface ────────────────────────────────────────────────
  //
  // Server-side semantics: this SDK does NOT read NFC chips. Mobile
  // clients (Flutter / React-Native / iOS / Android) extract the SOD
  // + DG bytes; your backend forwards them to `kyc.submitNfc` as
  // base64 strings.
  readonly kyc = {
    createApplication: (
      body: import("./types.js").KycApplicationCreateInput,
      opts?: RequestOptions,
    ): Promise<import("./types.js").KycApplicationCreated> =>
      this.#post("/v1/kyc/applications", body, opts),

    status: (
      applicationId: string,
      opts?: { includeExtracted?: boolean },
    ): Promise<import("./types.js").KycStatus> => this.#get(
      `/v1/kyc/applications/${encodeURIComponent(applicationId)}/status${
        opts?.includeExtracted ? "?include_extracted=true" : ""}`,
    ),

    uploadDocument: (
      applicationId: string,
      clientToken: string,
      body: import("./types.js").KycDocumentSubmit,
    ): Promise<import("./types.js").KycDocumentResponse> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/documents`,
        body, { clientToken },
      ),

    /** Forward an NFC chip read produced by a mobile client.
     *  All bytes already base64-encoded. Set `access_error: true` +
     *  omit SOD when the mobile reader reports a chip-access failure. */
    submitNfc: (
      applicationId: string,
      clientToken: string,
      body: import("./types.js").KycNfcSubmit,
    ): Promise<import("./types.js").KycNfcResponse> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/nfc`,
        body, { clientToken },
      ),

    /** Shortcut for the access-error path. */
    nfcAccessError: (
      applicationId: string,
      clientToken: string,
      opts?: { protocol?: "BAC" | "PACE"; code?: string },
    ): Promise<import("./types.js").KycNfcResponse> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/nfc`,
        {
          protocol: opts?.protocol ?? "PACE",
          access_error: true,
          access_error_code: opts?.code ?? "chip_not_responding",
        },
        { clientToken },
      ),

    uploadSelfie: (
      applicationId: string,
      clientToken: string,
      body: import("./types.js").KycSelfieSubmit,
    ): Promise<unknown> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/selfie`,
        body, { clientToken },
      ),

    livenessChallenge: (
      applicationId: string,
      clientToken: string,
      body?: { length?: number; ttl_seconds?: number },
    ): Promise<import("./types.js").KycLivenessChallenge> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/liveness/challenge`,
        body ?? { length: 3, ttl_seconds: 60 },
        { clientToken },
      ),

    submitLiveness: (
      applicationId: string,
      clientToken: string,
      body: import("./types.js").KycLivenessSubmit,
    ): Promise<unknown> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/liveness`,
        body, { clientToken },
      ),

    submit: (
      applicationId: string,
      clientToken: string,
    ): Promise<import("./types.js").KycDecision> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/submit`,
        {}, { clientToken },
      ),

    retry: (
      applicationId: string,
      clientToken: string,
      reason?: string,
    ): Promise<unknown> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/retry`,
        reason ? { reason } : {},
        { clientToken },
      ),

    extendTtl: (
      applicationId: string,
      clientToken: string,
    ): Promise<unknown> =>
      this.#post(
        `/v1/kyc/applications/${encodeURIComponent(applicationId)}/extend-ttl`,
        {}, { clientToken },
      ),
  };

  // ── KYC tenant admin (compliance officer surface) ──────────────────
  readonly kycAdmin = {
    list: (
      params?: { state?: string; intent?: string; persona_id?: string;
        nfc_required?: boolean; limit?: number; cursor?: string; },
    ): Promise<import("./types.js").KycAdminListResponse> => {
      const qs = params
        ? "?" + new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => [k, String(v)] as [string, string]),
          ).toString()
        : "";
      return this.#get(`/v1/admin/kyc/applications${qs}`);
    },
    detail: (applicationId: string): Promise<unknown> =>
      this.#get(`/v1/admin/kyc/applications/${encodeURIComponent(applicationId)}`),
    approve: (applicationId: string,
              body?: { notes?: string; reset_risk?: boolean }): Promise<unknown> =>
      this.#post(`/v1/admin/kyc/applications/${encodeURIComponent(applicationId)}/approve`, body ?? {}),
    reject: (applicationId: string,
             body: { reason_code: string; notes?: string }): Promise<unknown> =>
      this.#post(`/v1/admin/kyc/applications/${encodeURIComponent(applicationId)}/reject`, body),
    requestRetry: (applicationId: string,
                    body?: { notes?: string }): Promise<unknown> =>
      this.#post(`/v1/admin/kyc/applications/${encodeURIComponent(applicationId)}/request-retry`, body ?? {}),
  };

  // ── Address Verification ───────────────────────────────────────────
  readonly addressVerification = {
    create: (body: import("./types.js").AVCreateInput): Promise<import("./types.js").AVCreated> =>
      this.#post("/v1/address-verifications", body),
    uploadProof: (verificationId: string, clientToken: string,
                   body: import("./types.js").AVProofInput): Promise<import("./types.js").AVProofUploaded> =>
      this.#post(`/v1/address-verifications/${encodeURIComponent(verificationId)}/proof`,
                  body, { clientToken }),
    submit: (verificationId: string, clientToken: string): Promise<unknown> =>
      this.#post(`/v1/address-verifications/${encodeURIComponent(verificationId)}/submit`,
                  {}, { clientToken }),
    status: (verificationId: string): Promise<import("./types.js").AVStatus> =>
      this.#get(`/v1/address-verifications/${encodeURIComponent(verificationId)}/status`),
  };

  // ── Personas ───────────────────────────────────────────────────────
  readonly personas = {
    create: (body: { subject_external_id?: string; display_name?: string;
                      meta?: Record<string, unknown> }): Promise<unknown> =>
      this.#post("/v1/personas", body),
    list: (params?: { subject_external_id?: string; limit?: number; cursor?: string }):
      Promise<unknown> => {
      const qs = params
        ? "?" + new URLSearchParams(
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== "")
              .map(([k, v]) => [k, String(v)] as [string, string]),
          ).toString()
        : "";
      return this.#get(`/v1/personas${qs}`);
    },
    get: (personaId: string): Promise<unknown> =>
      this.#get(`/v1/personas/${encodeURIComponent(personaId)}`),
  };

  // ── platform-level ─────────────────────────────────────────────────
  status = (): Promise<StatusPayload> => this.#get("/v1/status");

  // ───────────────────────────────────────────────────────────────────

  async #get<T>(path: string): Promise<T> {
    return this.#req<T>("GET", path, undefined, {});
  }

  async #post<T>(path: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.#req<T>("POST", path, body, opts ?? {});
  }

  async #reportPdf(path: string, body: unknown, opts?: RequestOptions): Promise<Uint8Array> {
    const blob = await this.#req<Blob>("POST", path, body, {
      ...(opts ?? {}),
      accept: "application/pdf",
      binary: true,
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  async #req<T>(
    method: "GET" | "POST", path: string, body: unknown, opts: RequestOptions,
    retried = false,
  ): Promise<T> {
    const url = `${this.#base}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      ...this.#headers,
      "Authorization": `Bearer ${this.#apiKey}`,
    };
    if (opts.accept) headers["Accept"] = opts.accept;
    if (opts.idem)   headers["Idempotency-Key"] = opts.idem;
    if (opts.clientToken) headers["X-KYC-Client-Token"] = opts.clientToken;

    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = opts.contentType ?? "application/json";
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.#fetch(url, { method, headers, body: payload, signal: ctrl.signal });
    } catch (err) {
      throw new LegichainNetworkError(
        err instanceof Error ? err.message : "fetch failed", err,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      let problem: import("./types.js").ProblemDetails | undefined;
      try {
        problem = (await res.json()) as import("./types.js").ProblemDetails;
      } catch { /* tolerate non-JSON errors */ }
      // This account is served by another deployment. The reply names
      // it, so move and try again — once. Both 421s the API can send
      // are produced before the request reaches a handler, so nothing
      // was written and the retry is not a duplicate, with or without
      // an idempotency key.
      if (res.status === 421 && !retried && problem?.code === WRONG_REGION) {
        const next = problem.api_base_url
          ?? (problem.region ? regionHost(problem.region) : null);
        if (next) {
          const pinned = next.replace(/\/$/, "");
          if (pinned !== this.#base) {
            this.#base   = pinned;
            this.#region = problem.region ?? this.#region;
            return this.#req<T>(method, path, body, opts, true);
          }
        }
      }

      throw new LegichainError(problem ?? {
        type: "https://legichain.com/errors/UNKNOWN",
        title: res.statusText || "Error",
        status: res.status,
        code: `HTTP_${res.status}`,
      });
    }

    if (opts.binary) {
      return (await res.blob()) as T;
    }

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }
}
