import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

const vote = (body: any, anon = "v1") =>
  worker
    .fetch(new Request("https://x/api/votes", { method: "POST", headers: { "X-Anon-Id": anon }, body: JSON.stringify(body) }), env as any, {} as any)
    .then((r) => r.json());

describe("votes", () => {
  it("toggles on then off and adjusts count", async () => {
    const a: any = await vote({ target_type: "thread", target_id: "t1" });
    expect(a.voted).toBe(true);
    const b: any = await vote({ target_type: "thread", target_id: "t1" });
    expect(b.voted).toBe(false);
    expect(b.votes).toBe(a.votes - 1);
  });

  it("dedups across repeated on-votes from same actor", async () => {
    await vote({ target_type: "post", target_id: "t1" }, "v2");
    const again: any = await vote({ target_type: "post", target_id: "t1" }, "v2");
    expect(again.voted).toBe(false); // second call toggles off, not double-count
  });

  it("400s an unknown target_type", async () => {
    const r = await worker.fetch(
      new Request("https://x/api/votes", { method: "POST", headers: { "X-Anon-Id": "v3" }, body: JSON.stringify({ target_type: "bogus", target_id: "t1" }) }),
      env as any,
      {} as any
    );
    expect(r.status).toBe(400);
  });

  it("400s a missing target_id", async () => {
    const r = await worker.fetch(
      new Request("https://x/api/votes", { method: "POST", headers: { "X-Anon-Id": "v4" }, body: JSON.stringify({ target_type: "thread" }) }),
      env as any,
      {} as any
    );
    expect(r.status).toBe(400);
  });
});
