/* Public response shapes — mirror legichain.api.schemas (Pydantic). */

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
}
