import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

// Bot features off: the tick itself is a no-op here; this only checks the gate.
const E = (extra: Record<string, unknown> = {}) => ({ ...env, FEATURE_X: "off", ...extra }) as any;
const call = (e: any, init: RequestInit = { method: "POST" }) => worker.fetch(new Request("https://realufo.org/__tick", init), e, {} as any);

describe("POST /__tick", () => {
  it("is a 404 unless ADMIN_TOKEN is set and the bearer token matches", async () => {
    expect((await call(E())).status).toBe(404); // no ADMIN_TOKEN: endpoint off
    const e = E({ ADMIN_TOKEN: "s3cret" });
    expect((await call(e)).status).toBe(404);
    expect((await call(e, { method: "POST", headers: { authorization: "Bearer nope" } })).status).toBe(404);
    expect((await call(e, { method: "GET", headers: { authorization: "Bearer s3cret" } })).status).toBe(404);
    const ok = await call(e, { method: "POST", headers: { authorization: "Bearer s3cret" } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
  });
});
