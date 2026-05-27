# Changelog

## 0.2.0 — 2026-05-27

* **KYC** identity verification — full `client.kyc.*` surface for
  `/v1/kyc/applications/*`. Server-side: forward base64-encoded NFC
  chip bytes from a mobile client; this SDK never reads chips itself.
* **KYC tenant admin** — `client.kycAdmin.{list,detail,approve,reject,requestRetry}`.
* **Address Verification** — `client.addressVerification.{create,uploadProof,submit,status}`.
* **Personas** — `client.personas.{create,list,get}`.
* `RequestOptions.clientToken` → sent as `X-KYC-Client-Token` header.
* New typed exports: `KycApplicationCreateInput`, `KycStatus`,
  `KycDecision`, `AVCreateInput`, `AVStatus`, etc. See `types.ts`.

# Changelog

All notable changes to the Legichain Node.js / TypeScript SDK.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the package follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-05-20

First public release on npm.

### Added
- `Legichain` client built on the global `fetch` API (Node 18+).
- `lc.screen.person / company / crypto / batch / batchAsync / job`.
- `lc.reports.wallet / person / company` — returns the PDF as a
  `Uint8Array`.
- `lc.status()` — platform status payload.
- Full TypeScript types for every response (`HitFlags`,
  `ScreeningSummary`, `ScreeningResponse`, `Recommendation`,
  `RiskLevel`, `ProblemDetails`, …).
- `LegichainError` carries the RFC 7807 problem-details body so
  callers can branch on `err.code` and `err.status`.
- `verifyWebhookSignature` helper — HMAC-SHA256, constant-time
  comparison, configurable replay tolerance.
- Dual ESM + CommonJS build via `tsup`; `legichain` and
  `legichain/webhooks` entrypoints.

### Requirements
- Node.js 18+
- No runtime dependencies (uses native `fetch`).
