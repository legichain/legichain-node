/* Public response shapes — mirror legichain.api.schemas (Pydantic). */

export type OperationState = "queued" | "running" | "completed" | "failed" | "expired" | "cancelled";
export interface OperationAccepted {
  operation_id: string; status: OperationState; status_url: string;
  deadline_at: string; protocol: 1; items?: number;
}
export interface OperationSummary {
  id: string; kind: string; status: OperationState; created_at: string;
  deadline_at: string; finished_at: string | null; error_code: string | null;
}
export interface OperationTaskSummary {
  id: string; step_key: string; pool: string;
  status: "blocked" | "ready" | "dispatched" | "retry" | Exclude<OperationState,"queued">;
  error_code: string | null; attempts: number; finished_at: string | null; result_url: string;
}
export interface OperationStatus extends OperationSummary {
  result: Record<string, unknown> | null; result_purged_at: string | null;
  data_revoked: boolean; data_purged: boolean; tasks: OperationTaskSummary[];
}
export interface OperationTaskResult extends Omit<OperationTaskSummary,"attempts" | "result_url"> {
  created_at: string; result: Record<string, unknown> | null;
  result_purged_at: string | null; data_revoked: boolean; data_purged: boolean;
}
export interface OperationPage { items: OperationSummary[]; next_cursor: string | null }

export interface HitFlags {
  is_sanctioned:    boolean;
  is_pep:           boolean;
  is_wanted:        boolean;
  is_crime:         boolean;
  is_adverse_media: boolean;
}

export type RiskLevel = "no" | "low" | "medium" | "high" | "critical";
export type Recommendation = "clear" | "review" | "block";

export interface Hit {
  entity_id:        string;
  canonical_id:     string;
  schema:           string;
  caption:          string | null;
  score:            number;
  match_signals:    string[];
  topics:           string[];
  sources:          string[];
  countries:        string[];
  risk_score:       number;
  risk_source:      string;
  degree:           number;
  match_confidence: number;
  name_ratio:       number;
  flags:            HitFlags;
  risk_level:       RiskLevel;
}

export interface ScreeningSummary {
  matched:                boolean;
  hit_count:              number;
  has_sanctioned_hit:     boolean;
  has_pep_hit:            boolean;
  has_wanted_hit:         boolean;
  has_crime_hit:          boolean;
  has_adverse_media_hit:  boolean;
  top_risk_score:         number;
  top_risk_level:         RiskLevel;
  top_match_confidence:   number;
  recommendation:         Recommendation;
  authorities:            string[];
  sources:                string[];
}

export interface ScreeningResponse {
  request_id:        string;
  matched:           boolean;
  summary:           ScreeningSummary;
  hits:              Hit[];
  search_time_ms:    number;
  cost_credits:      number;
  credits_remaining: number;
  screening_id?:     string;
}

export interface PersonQuery {
  name:    string;
  country?: string;
  dob?:     string;
  document?: string;
  topics?:  string[];
  top_n?:   number;
}

export interface CompanyQuery {
  name: string;
  country?: string;
  registration_number?: string;
  top_n?: number;
}

export interface CryptoQuery {
  address: string;
  chain?:  "btc" | "eth" | "bsc" | "tron" | "sol" | string;
}

export type BatchItem = PersonQuery | CompanyQuery | CryptoQuery;

export interface BatchAsyncResponse {
  job_id:         string;
  status:         "queued";
  items:          number;
  callback_event: "screen.batch.completed";
}

export interface JobStatus {
  job_id:      string;
  status:      "queued" | "running" | "done" | "failed";
  kind:        string;
  started_at:  string | null;
  finished_at: string | null;
  result:      unknown;
  error:       string | null;
}

export interface StatusComponent {
  api:       "operational" | "degraded" | "outage";
  screening: "operational" | "degraded" | "outage";
  reports:   "operational" | "degraded" | "outage";
  webhooks:  "operational" | "degraded" | "outage";
}
export interface StatusIncident {
  id:           string;
  title:        string;
  severity:     "minor" | "major" | "maintenance";
  status:       "investigating" | "identified" | "monitoring" | "resolved";
  started_at:   string;
  resolved_at?: string | null;
  description?: string | null;
}
export interface StatusPayload {
  status:           "operational" | "degraded" | "major_outage";
  as_of:            string;
  components:       StatusComponent;
  active_incidents: StatusIncident[];
  recent_30d:       StatusIncident[];
}

export interface ProblemDetails {
  type:     string;
  title:    string;
  status:   number;
  detail?:  string;
  code:     string;
  instance?: string;
  errors?:  Array<Record<string, unknown>>;
  /** On a 421 (`REG_001_WRONG_REGION`): the region that owns this
   *  account, and the host that serves it. The client re-pins to that
   *  host and retries, so callers rarely see this error at all. */
  region?:  string;
  api_base_url?: string;
}


// ── KYC ──────────────────────────────────────────────────────────────

export type DocumentType =
  | "tr_id_card" | "passport" | "driver_license"
  | "eu_national_id" | "uk_passport";

export type DocumentSide = "front" | "back" | "single";

export type Intent = "onboarding" | "re_verification" | "periodic_review";

export type KycCurrentStep =
  | "ready_to_upload_document" | "upload_document" | "processing_document"
  | "upload_nfc" | "upload_selfie" | "processing_biometrics" | "deciding"
  | "completed_approved" | "completed_rejected" | "in_manual_review"
  | "retry_pending" | "expired" | "canceled" | "unknown";

export type DecisionOutcome = "approved" | "rejected" | "manual_review";

export interface KycApplicationCreateInput {
  subject_external_id?: string;
  persona_id?: string;
  external_reference?: string;
  intent?: Intent;
  document_type_allowed?: DocumentType[];
  nfc_required?: boolean;
  callback_url?: string;
  claimed_full_name?: string;
  claimed_personal_number?: string;
  /** YYYY-MM-DD */
  claimed_birth_date?: string;
  /** YYYY-MM-DD */
  claimed_expiry_date?: string;
  claimed_document_number?: string;
  /** ISO 3166-1 alpha-3. */
  claimed_nationality?: string;
  claimed_issuing_country?: string;
  claimed_sex?: "M" | "F";
  claimed_document_type?: DocumentType;
  meta?: Record<string, unknown>;
}

export interface KycApplicationCreated {
  application_id: string;
  persona_id: string;
  persona_created: boolean;
  client_token: string;
  client_token_expires_at?: string;
  state: string;
  next_steps: string[];
  expires_at: string;
}

export interface KycStatus {
  application_id: string;
  persona_id: string;
  state: string;
  current_step: KycCurrentStep;
  retry_available: boolean;
  current_attempt: number;
  max_attempts: number;
  risk_score: number | null;
  decision: {
    outcome: DecisionOutcome | null;
    outcome_reason: string | null;
    decision_id: string | null;
    risk_score: number | null;
  } | null;
  extracted_fields: Record<string, unknown> | null;
  extracted_fields_by_source: Record<string, unknown> | null;
  completed_at: string | null;
  expires_at: string;
  requested_at: string;
}

export interface KycDocumentSubmit {
  document_type: DocumentType;
  side: DocumentSide;
  mime_type: "image/jpeg" | "image/png" | "image/heic";
  /** Base64-encoded JPEG/PNG/HEIC bytes. */
  image_b64: string;
  captured_at_client?: string;
  device_attestation?: Record<string, unknown>;
}

export interface KycDocumentResponse {
  document_id: string;
  image_id: string;
  state: string;
  iqa_passed: boolean;
  iqa_reason: string | null;
  extraction_status: "pending" | "extracting" | "extracted" | "failed";
}

export interface KycNfcSubmit {
  protocol: "BAC" | "PACE";
  key_derivation?: "MRZ" | "CAN";
  /** Set true when the mobile reader couldn't get any chip data. The
   *  server records a soft-fail and keeps state at `awaiting_nfc`. */
  access_error?: boolean;
  access_error_code?: string;
  /** Base64 of SOD bytes. Required when access_error is false. */
  sod_b64?: string;
  dg1_b64?: string; dg2_b64?: string;
  dg7_b64?: string; dg11_b64?: string;
  dg12_b64?: string; dg13_b64?: string;
  dg14_b64?: string; dg15_b64?: string;
  active_authentication_b64?: string;
  read_at_client?: string;
}

export interface KycNfcResponse {
  nfc_read_id: string;
  state: string;
  verification_status: "passed" | "failed" | "access_error" | "pending";
  passive_auth_passed: boolean | null;
  cert_chain_valid: boolean | null;
  csca_country: string | null;
  dg_hash_results: Record<string, boolean>;
  failure_codes: string[];
}

export interface KycSelfieSubmit {
  mime_type: "image/jpeg" | "image/png" | "image/heic";
  image_b64: string;
  is_video?: boolean;
  captured_at_client?: string;
}

export interface KycLivenessChallenge {
  application_id: string;
  challenge_token: string;
  sequence: string[];
  issued_at: string;
  valid_until: string;
}

export interface KycLivenessSubmit {
  challenge_token: string;
  actions_performed: string[];
  frames_b64?: string[];
  pad_score?: number;
}

export interface KycDecision {
  application_id: string;
  persona_id: string;
  outcome: DecisionOutcome;
  outcome_reason: string | null;
  risk_score: number | null;
  decision_id: string;
  hard_fail_codes: string[];
  manual_review_id: string | null;
  completed_at: string | null;
}

export interface KycAdminListItem {
  application_id: string;
  persona_id: string;
  state: string;
  intent: string;
  risk_score: number | null;
  outcome: string | null;
  nfc_required: boolean;
  document_type_allowed: DocumentType[];
  requested_at: string;
  completed_at: string | null;
  expires_at: string;
  has_manual_review: boolean;
}

export interface KycAdminListResponse {
  items: KycAdminListItem[];
  next_cursor: string | null;
  total_estimate: number;
}

// ── Address Verification ─────────────────────────────────────────────

export type AVDocumentType =
  | "utility_bill" | "bank_statement" | "gov_letter"
  | "telco_bill" | "residency_certificate" | "tax_letter";

export interface ClaimedAddress {
  line1?: string; line2?: string;
  city?: string; state?: string;
  postal_code?: string;
  /** ISO 3166-1 alpha-2 or alpha-3. */
  country: string;
}

export interface AVCreateInput {
  external_reference?: string;
  subject_external_id?: string;
  persona_id?: string;
  claimed_address: ClaimedAddress;
  accepted_document_types?: AVDocumentType[];
  max_age_days?: number;
  callback_url?: string;
}

export interface AVCreated {
  verification_id: string;
  persona_id: string;
  state: string;
  client_token: string;
  expires_at: string;
}

export interface AVProofInput {
  document_type: AVDocumentType;
  mime_type: "application/pdf" | "image/jpeg" | "image/png" | "image/heic";
  image_b64: string;
  captured_at_client?: string;
}

export interface AVProofUploaded {
  proof_id: string;
  state: string;
  extraction_status: string;
  parsed_issuer: string | null;
  parsed_issued_at: string | null;
  parsed_address: string | null;
}

export interface AVStatus {
  verification_id: string;
  persona_id: string;
  state: string;
  current_attempt: number;
  max_attempts: number;
  match_confidence: number | null;
  outcome: string | null;
  outcome_reason: string | null;
  completed_at: string | null;
  expires_at: string;
  requested_at: string;
}
