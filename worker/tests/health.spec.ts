import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../index";

describe("health", () => {
  it("returns ok", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/api/health"), env as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "realufo" });
  });

  it("answers HEAD like GET, with no body", async () => {
    const res = await worker.fetch(new Request("https://x/api/health", { method: "HEAD" }), env as any, {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect(await res.text()).toBe("");
  });
});
