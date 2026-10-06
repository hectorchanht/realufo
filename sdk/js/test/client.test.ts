// realufo JS SDK tests: fetch is stubbed, so no network.
import { describe, it, expect, vi } from "vitest";
import { RealUFO, RealUFOError } from "../src/index";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const stub = (body: unknown, status = 200) => vi.fn().mockResolvedValue(json(body, status));

describe("RealUFO client", () => {
  it("records() builds the query string and returns { data, meta }", async () => {
    const f = stub({ data: [{ id: "A" }], meta: { total: 1, page: 2, per_page: 5 } });
    const api = new RealUFO("https://x/api/v1", f as any);
    const r = await api.records({ q: "tic tac", page: 2, per_page: 5 });
    expect(f.mock.calls[0][0]).toContain("/records?q=tic+tac&page=2&per_page=5");
    expect(r.data[0].id).toBe("A");
    expect(r.meta.total).toBe(1);
  });
  it("record() encodes the id", async () => {
    const f = stub({ data: { id: "DOW-UAP-PR057a" } });
    const api = new RealUFO("https://x/api/v1", f as any);
    const r = await api.record("DOW-UAP-PR057a");
    expect(f.mock.calls[0][0]).toBe("https://x/api/v1/records/DOW-UAP-PR057a");
    expect(r.id).toBe("DOW-UAP-PR057a");
  });
  it("throws RealUFOError with status on API errors", async () => {
    const f = stub({ error: "record not found" }, 404);
    const api = new RealUFO("https://x/api/v1", f as any);
    await expect(api.record("NOPE")).rejects.toMatchObject({ status: 404 });
    await expect(api.record("NOPE")).rejects.toBeInstanceOf(RealUFOError);
  });
  it("webhook() POSTs url+events; deleteWebhook sends the secret header", async () => {
    const f = stub({ data: { id: "wh_1", secret: "s" } }, 201);
    const api = new RealUFO("https://x/api/v1", f as any);
    await api.webhook("https://example.com/h", ["release.created"]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x/api/v1/webhooks");
    expect(JSON.parse(init.body)).toEqual({ url: "https://example.com/h", events: ["release.created"] });
    const f2 = stub({ data: { deleted: true } });
    const api2 = new RealUFO("https://x/api/v1", f2 as any);
    await api2.deleteWebhook("wh_1", "s3cret");
    expect(f2.mock.calls[0][1].headers["x-webhook-secret"]).toBe("s3cret");
  });
  it("verifyWebhook validates the HMAC signature", async () => {
    // signature produced the same way the worker signs (lib/webhooks.ts)
    const secret = "testsecret";
    const body = '{"event":"release.created"}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await RealUFO.verifyWebhook(secret, body, hex)).toBe(true);
    expect(await RealUFO.verifyWebhook(secret, body, "0".repeat(64))).toBe(false);
  });
});
