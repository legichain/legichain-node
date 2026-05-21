import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWebhookSignature } from "../src/webhooks.js";

const secret = "whsec_test_12345";

function sign(body: string, ts: number, badSecret?: string) {
  const h = createHmac("sha256", badSecret ?? secret).update(`${ts}.${body}`).digest("hex");
  return `t=${ts},v1=${h}`;
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "screening.high_risk", id: "01HXYZ" });
  const now = Math.floor(Date.now() / 1000);

  it("accepts a freshly signed body", () => {
    const ok = verifyWebhookSignature({
      body, secret, signature: sign(body, now), now: () => now,
    });
    expect(ok).toBe(true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const ok = verifyWebhookSignature({
      body, secret, signature: sign(body, now, "whsec_other"), now: () => now,
    });
    expect(ok).toBe(false);
  });

  it("rejects a body older than the tolerance window", () => {
    const stale = now - 600;
    const ok = verifyWebhookSignature({
      body, secret, signature: sign(body, stale), now: () => now,
    });
    expect(ok).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    const ok = verifyWebhookSignature({
      body, secret, signature: "garbage", now: () => now,
    });
    expect(ok).toBe(false);
  });

  it("accepts a Buffer body matching the string variant", () => {
    const sig = sign(body, now);
    expect(verifyWebhookSignature({ body: Buffer.from(body), secret, signature: sig, now: () => now })).toBe(true);
  });
});


describe("client surface (sanity)", async () => {
  const { Legichain, LegichainError, LegichainNetworkError } = await import("../src/index.js");

  it("exports the client and error classes", () => {
    expect(typeof Legichain).toBe("function");
    expect(typeof LegichainError).toBe("function");
    expect(typeof LegichainNetworkError).toBe("function");
  });

  it("throws when apiKey is missing", () => {
    expect(() => new Legichain({ apiKey: "" })).toThrow();
  });

  it("constructs with default base url", () => {
    const lc = new Legichain({ apiKey: "k", fetch: globalThis.fetch });
    expect(lc.baseUrl).toBe("https://api.legichain.com");
  });

  it("hits a custom fetch", async () => {
    let url = ""; let auth = "";
    const fakeFetch = (async (req: string, init: RequestInit) => {
      url = req;
      auth = String((init.headers as Record<string, string>)["Authorization"]);
      return new Response(JSON.stringify({
        request_id: "req_1", matched: false,
        summary: { matched: false, hit_count: 0, has_sanctioned_hit: false, has_pep_hit: false, has_wanted_hit: false, has_crime_hit: false, has_adverse_media_hit: false, top_risk_score: 0, top_risk_level: "no", top_match_confidence: 0, recommendation: "clear", authorities: [], sources: [] },
        hits: [], search_time_ms: 12, cost_credits: 0, credits_remaining: 100,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const lc = new Legichain({ apiKey: "test-key", fetch: fakeFetch });
    const r = await lc.screen.person({ name: "John Doe" });
    expect(url).toBe("https://api.legichain.com/v1/screen/person");
    expect(auth).toBe("Bearer test-key");
    expect(r.matched).toBe(false);
  });
});
