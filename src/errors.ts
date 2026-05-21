import type { ProblemDetails } from "./types.js";

/** Thrown for every non-2xx response. Carries the RFC 7807 problem
 *  body so callers can branch on `err.code` / `err.status`. */
export class LegichainError extends Error {
  readonly status:   number;
  readonly code:     string;
  readonly title:    string;
  readonly detail:   string;
  readonly instance: string | undefined;
  readonly errors:   Array<Record<string, unknown>>;
  readonly problem:  ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(`${problem.title}: ${problem.detail ?? problem.code}`);
    this.name     = "LegichainError";
    this.status   = problem.status;
    this.code     = problem.code;
    this.title    = problem.title;
    this.detail   = problem.detail ?? "";
    this.instance = problem.instance;
    this.errors   = problem.errors ?? [];
    this.problem  = problem;
  }
}

/** Thrown on transport-level failure (DNS, TLS, socket close, timeout). */
export class LegichainNetworkError extends Error {
  override readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name  = "LegichainNetworkError";
    this.cause = cause;
  }
}
