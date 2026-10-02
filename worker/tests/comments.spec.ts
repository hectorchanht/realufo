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
    expect(typeof j.comment.created_at).toBe("string");
    expect(j.comment.created_at.length).toBeGreaterThan(0);
    expect(j.comment.record_id).toBeUndefined();
    const list: any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(list.comments.some((c: any) => c.body === "test read")).toBe(true);
  });
  it("404s posting to an unknown record", async () => {
    const r = await call("/api/records/NOPE/comments", { method: "POST", body: JSON.stringify({ body: "hi" }) });
    expect(r.status).toBe(404);
  });
  it("rejects a non-string body instead of throwing", async () => {
    const r = await call("/api/records/CIA-UAP-017/comments", { method: "POST", body: JSON.stringify({ body: 123 }) });
    expect(r.status).toBe(400);
  });

  it("text-only comments carry image_url: null", async () => {
    const j: any = await (await call("/api/records/CIA-UAP-017/comments")).json();
    expect(j.comments[0].image_url).toBeNull();
  });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const withImage = (path: string, body: string, bytes = PNG) => {
  const f = new FormData();
  f.set("body", body);
  f.set("stance", "analyst");
  f.set("image", new File([bytes], "x.png", { type: "image/png" }));
  return call(path, { method: "POST", headers: { "X-Anon-Id": "cimg" }, body: f });
};

describe("comment images", () => {
  for (const [label, path] of [
    ["record", "/api/records/CIA-UAP-017/comments"],
    ["case", "/api/cases/roswell/comments"],
  ]) {
    it(`${label} comment with image: stored, listed, served`, async () => {
      const r = await withImage(path, `${label} pic`);
      expect(r.status).toBe(201);
      const { comment }: any = await r.json();
      expect(comment.stance).toBe("analyst");
      expect(comment.image_url).toMatch(/^\/api\/u\/[0-9a-f-]{36}\.png$/);
      const list: any = await (await call(path)).json();
      expect(list.comments.find((c: any) => c.body === `${label} pic`).image_url).toBe(comment.image_url);
      const img = await call(comment.image_url);
      expect(img.status).toBe(200);
      expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
    });
  }

  it("rejects a non-image file on a comment", async () => {
    const r = await withImage("/api/records/CIA-UAP-017/comments", "evil", new Uint8Array(new TextEncoder().encode("<svg>")));
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toMatch(/image must be/);
  });

  it("does not store an image for a comment on an unknown record", async () => {
    const before = await env.MEDIA.list({ prefix: "uploads/" });
    expect((await withImage("/api/records/NOPE/comments", "orphan")).status).toBe(404);
    const after = await env.MEDIA.list({ prefix: "uploads/" });
    expect(after.objects.length).toBe(before.objects.length);
  });
});
