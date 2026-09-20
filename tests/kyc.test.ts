import { describe, it, expect } from "vitest";
import { Legichain } from "../src/client.js";

describe("guided backend KYC session", () => {
  it("keeps the client token internal and distinguishes receipt, evidence and submission", async () => {
    const requests: {url: string; init: RequestInit}[] = [];
    let state = "queued";
    const client = new Legichain({apiKey: "tenant.secret", fetch: (async (url: string | URL | Request, init: RequestInit = {}) => {
      requests.push({url: String(url), init});
      const path = new URL(String(url)).pathname;
      const body = path === "/v1/kyc/applications" ? {application_id: "tr_app", client_token: "internal"}
        : path.startsWith("/v2/kyc/") ? {operation_id: "tr_op", status: "queued"}
        : path.endsWith("/submit") ? {pending: true, outcome: null, state: "deciding"}
        : {id: "tr_op", status: state};
      return new Response(JSON.stringify(body), {status: 200, headers: {"Content-Type": "application/json"}});
    }) as typeof fetch});
    const flow = await client.kyc.start({liveness_required: false}, {idem: "create"});
    await flow.evidence("liveness", {mode: "active", frame_b64: "A".repeat(128), challenge_token: "ch",
      completed_actions: [{action: "blink", started_at_ms: 100, ended_at_ms: 1500}],
      frames: [{image_b64: "A".repeat(128), timestamp_ms: 500}]}, "same-capture-key");
    expect(new Headers(requests[1]!.init.headers).get("X-KYC-Client-Token")).toBe("internal");
    await expect(flow.submit()).rejects.toThrow("still processing");
    expect(requests.some(r => r.url.endsWith("/submit"))).toBe(false);
    await expect(flow.wait("other")).rejects.toThrow("does not belong");
    state = "failed";
    await expect(flow.wait("tr_op")).rejects.toThrow("failed");
    state = "completed";
    expect((await flow.wait("tr_op")).status).toBe("completed");
    expect((await flow.submit()).pending).toBe(true);
  });
});
