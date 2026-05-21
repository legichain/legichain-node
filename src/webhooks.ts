import { createHmac, timingSafeEqual } from "node:crypto";

/** Default replay tolerance: 5 minutes (matches the server). */
const DEFAULT_TOLERANCE_SEC = 5 * 60;

export interface VerifyOptions {
  /** Raw request body — MUST be the exact bytes the signature was
   *  computed over, not a re-serialised JSON string. */
  body: string | Uint8Array | Buffer;
  /** Value of the `Legichain-Signature` header, of the form
   *  `t=<unix>,v1=<hex>`. */
  signature: string;
  /** Endpoint secret as shown in the panel (starts with `whsec_…`). */
  secret: string;
  /** Drop messages older than this many seconds. Defaults to 300. */
  toleranceSec?: number;
  /** For deterministic tests — defaults to `Date.now() / 1000`. */
  now?: () => number;
}

/**
 * Verify the HMAC-SHA256 signature attached to an inbound Legichain
 * webhook. Returns `true` only when:
 *
 *   • the signature header parses,
 *   • the timestamp is within tolerance,
 *   • and `hmac_sha256(secret, "{t}.{body}")` matches `v1`.
 *
 * Constant-time comparison via Node's `timingSafeEqual`.
 */
export function verifyWebhookSignature(opts: VerifyOptions): boolean {
  const now = (opts.now ?? (() => Date.now() / 1000))();
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;

  // header: t=<unix>,v1=<hex>
  const parts = opts.signature.split(",").map(p => p.trim()).filter(Boolean);
  let t: string | undefined; let v1: string | undefined;
  for (const p of parts) {
    if (p.startsWith("t="))  t  = p.slice(2);
    if (p.startsWith("v1=")) v1 = p.slice(3);
  }
  if (!t || !v1) return false;

  const ts = Number.parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > tolerance) return false;

  const body = typeof opts.body === "string"
    ? Buffer.from(opts.body, "utf8")
    : Buffer.from(opts.body);
  const signed = Buffer.concat([Buffer.from(`${t}.`, "utf8"), body]);

  const expected = createHmac("sha256", opts.secret).update(signed).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
