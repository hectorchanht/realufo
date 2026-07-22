import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);

describe("comments", () => {
  it("lists seeded comments for a record", async () => {
    const j: any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(j.comments.length).toBeGreaterThanOrEqual(1);
    expect(j.comments[0]).toHaveProperty("ago");
  });
  it("rejects empty body", async () => {
    expect((await call("/api/records/CIA-UAP-017/comments", { method: "POST", body: JSON.stringify({ body: "  " }) })).status).toBe(400);
  });
  it("creates a comment and returns it", async () => {
    const r = await call("/api/records/CIA-UAP-017/comments", {
      method: "POST",
      headers: { "X-Anon-Id": "u1" },
      body: JSON.stringify({ body: "test read", stance: "analyst" }),
    });
    const j: any = await r.json();
    expect(r.status).toBe(201);
    expect(j.comment.body).toBe("test read");
    expect(j.comment.stance).toBe("analyst");
    const list: any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(list.comments.some((c: any) => c.body === "test read")).toBe(true);
  });
  it("404s posting to an unknown record", async () => {
    const r = await call("/api/records/NOPE/comments", { method: "POST", body: JSON.stringify({ body: "hi" }) });
    expect(r.status).toBe(404);
  });
});
