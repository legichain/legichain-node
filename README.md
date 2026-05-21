# Legichain Node.js / TypeScript SDK

Official client for the **Legichain** AML, KYC and Travel Rule API.

```bash
npm install legichain
# or
pnpm add legichain
# or
yarn add legichain
```

[![npm](https://img.shields.io/npm/v/legichain.svg)](https://www.npmjs.com/package/legichain)
[![types](https://img.shields.io/npm/types/legichain.svg)](https://www.npmjs.com/package/legichain)
[![License](https://img.shields.io/npm/l/legichain.svg)](https://github.com/legichain/legichain-node/blob/main/LICENSE)

- TypeScript-first with full types for every response
- Native `fetch` (Node 18+) — zero runtime dependencies
- Dual ESM + CommonJS build
- HMAC webhook verification helper

---

## Quick start

```ts
import { Legichain } from "legichain";

const lc = new Legichain({
  apiKey: process.env.LEGICHAIN_API_KEY!,
  // baseUrl: "https://api.legichain.com",   // override for staging
});

// Screen a person — every response carries summary.recommendation
// so banks can branch in one line.
const r = await lc.screen.person({
  name: "Vladimir Putin",
  country: "RU",
  dob: "1952-10-07",
});

if (r.summary.recommendation === "block") {
  await denyOnboarding(customerId);
} else if (r.summary.recommendation === "review") {
  await queueForCompliance(customerId, r.screening_id);
} else {
  await approveOnboarding(customerId);
}

console.log(`${r.cost_credits} credits spent; ${r.credits_remaining} remaining`);
```

### Company + crypto wallet

```ts
const company = await lc.screen.company({
  name: "Rosneft Oil Company",
  country: "RU",
});

const wallet = await lc.screen.crypto({
  address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
});
```

### Batch (sync + async)

```ts
// Up to 200 items synchronously
const out = await lc.screen.batch([
  { name: "Acme Trading GmbH" },
  { address: "TVj7RNVH…", chain: "tron" },
  { name: "Maria Lopez", country: "ES" },
]);

// Async batch → result delivered to your webhook
const job = await lc.screen.batchAsync(items);
console.log(job.job_id);             // 01HXYZ…
// later …
console.log(await lc.screen.job(job.job_id));
```

### PDF reports

```ts
import { writeFile } from "node:fs/promises";

const pdf = await lc.reports.wallet({
  address: "0x6c0bD2BB04Fda9CBfeBb8DC1208Db32a0F8a4Edd",
  chain: "eth",
});
await writeFile("wallet.pdf", pdf);   // Uint8Array

await writeFile(
  "putin.pdf",
  await lc.reports.person({ name: "Vladimir Putin", country: "RU" }),
);
```

### Idempotency

```ts
await lc.screen.person(
  { name: "Maria Lopez" },
  { idem: "onboarding-2026-05-20-7f3c" },
);
// Re-running with the same `idem` within 24 h returns the cached
// response and the `Idempotent-Replay: true` header.
```

### Error handling

```ts
import { LegichainError } from "legichain";

try {
  await lc.screen.person({ name: "x" });
} catch (err) {
  if (err instanceof LegichainError) {
    console.log(err.status, err.code, err.detail);
    // err.errors[] for field-level validation problems
  } else {
    throw err;
  }
}
```

`LegichainError.code` enumerates everything in the API guide
(`AUTH_002_INVALID_TOKEN`, `BIL_001_INSUFFICIENT_CREDITS`,
`RL_001_RATE_LIMITED`, …).

### Webhook verification

```ts
import express from "express";
import { verifyWebhookSignature } from "legichain/webhooks";

const app = express();
app.post(
  "/webhooks/legichain",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const ok = verifyWebhookSignature({
      body:      req.body,
      signature: String(req.headers["legichain-signature"] ?? ""),
      secret:    process.env.LEGICHAIN_WEBHOOK_SECRET!,
    });
    if (!ok) return res.status(401).end();

    const evt = JSON.parse(req.body.toString("utf8"));
    if (evt.event === "screen.batch.completed") {
      // …
    }
    res.json({ ok: true });
  },
);
```

---

## TypeScript types

Every public response is fully typed — start with `ScreeningResponse`:

```ts
import type {
  Legichain, ScreeningResponse, Hit, HitFlags, ScreeningSummary,
  Recommendation, RiskLevel, ProblemDetails,
} from "legichain";
```

`hit.flags.is_sanctioned`, `summary.recommendation`,
`summary.top_risk_level`, `hits[].risk_score` — typed everywhere.

---

## Reference

| Method | Endpoint |
| --- | --- |
| `lc.screen.person(q)`       | `POST /v1/screen/person`        |
| `lc.screen.company(q)`      | `POST /v1/screen/company`       |
| `lc.screen.crypto(q)`       | `POST /v1/screen/crypto`        |
| `lc.screen.batch(items)`    | `POST /v1/screen/batch`         |
| `lc.screen.batchAsync(items)` | `POST /v1/screen/batch/async` |
| `lc.screen.job(jobId)`      | `GET  /v1/screen/jobs/{id}`     |
| `lc.reports.wallet(q)`      | `POST /v1/reports/wallet` (PDF) |
| `lc.reports.person(q)`      | `POST /v1/reports/person` (PDF) |
| `lc.reports.company(q)`     | `POST /v1/reports/company` (PDF)|
| `lc.status()`               | `GET  /v1/status`               |

---

## Versioning & support

- Tracks API `v1`. Breaking changes ship on `/v2/` with ≥ 6 months overlap.
- Status: <https://legichain.com/status>
- Email: `contact@legichain.com`
- GitHub: <https://github.com/legichain/legichain-node>
