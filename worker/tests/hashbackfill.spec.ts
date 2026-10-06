import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

const TOKEN = "test-admin-token";
function authed(path: string) {
  return new Request(`https://x${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

describe("POST /__hash-assets", () => {
  it("rejects without the admin token", async () => {
    const res = await worker.fetch(new Request("https://x/__hash-assets", { method: "POST" }), env as any, {} as any);
    expect(res.status).toBe(404);
  });
  it("hashes R2 objects and stores SHA-256 in D1", async () => {
    (env as any).ADMIN_TOKEN = TOKEN;
    const body = new TextEncoder().encode("hello realufo 2026");
    const want = createHash("sha256").update(body).digest("hex");
    await env.MEDIA.put("test/hashme.bin", body);
    await env.DB.prepare(
      "INSERT INTO assets (record_id, role, r2_key, cdn_url, mime, bytes) VALUES (?,?,?,?,?,?)"
    ).bind("TEST-HASH-1", "full", "test/hashme.bin", "https://assets.realufo.org/test/hashme.bin", "application/octet-stream", body.length).run();

    const res = await worker.fetch(authed("/__hash-assets?limit=5"), env as any, {} as any);
    expect(res.status).toBe(200);
    const d: any = await res.json();
    expect(d.hashed.length).toBeGreaterThan(0);
    const row = await env.DB.prepare("SELECT sha256 FROM assets WHERE r2_key=?").bind("test/hashme.bin").first<{ sha256: string }>();
    expect(row?.sha256).toBe(want);
    expect(d.remaining).toBe(0);

    // second call: nothing left to hash
    const res2 = await worker.fetch(authed("/__hash-assets?limit=5"), env as any, {} as any);
    const d2: any = await res2.json();
    expect(d2.hashed).toEqual([]);
    await env.MEDIA.delete("test/hashme.bin");
  });
  it("skips assets whose R2 object is missing", async () => {
    (env as any).ADMIN_TOKEN = TOKEN;
    await env.DB.prepare(
      "INSERT INTO assets (record_id, role, r2_key, cdn_url, mime) VALUES (?,?,?,?,?)"
    ).bind("TEST-HASH-2", "full", "test/does-not-exist.bin", "https://assets.realufo.org/test/does-not-exist.bin", "application/octet-stream").run();
    const res = await worker.fetch(authed("/__hash-assets?limit=5"), env as any, {} as any);
    const d: any = await res.json();
    expect(d.skipped.some((s: any) => s.reason === "r2 object missing")).toBe(true);
  });
});
