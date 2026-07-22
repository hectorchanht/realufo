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
});
