import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const form = (fields: Record<string, string>, bytes: Uint8Array, type = "image/png") => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  f.set("image", new File([bytes], "x.png", { type }));
  return call(fields.body ? "/api/threads/t1/posts" : "/api/threads", { method: "POST", headers: { "X-Anon-Id": "up1" }, body: f });
};

describe("image uploads", () => {
  it("new thread with image: stored, counted, served same-origin", async () => {
    const r = await form({ board: "uap", op_body: "with pic" }, PNG);
    expect(r.status).toBe(201);
    const { thread }: any = await r.json();
    expect(thread.img_count).toBe(1);

    const det: any = await (await call("/api/threads/" + thread.id)).json();
    const url = det.posts[0].image_url;
    expect(url).toMatch(/^\/api\/u\/[0-9a-f-]{36}\.png$/);
    expect(det.posts[0].image_kind).toBe("upload");

    const img = await call(url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);
  });

  it("reply with image bumps thread img_count", async () => {
    const before: any = await (await call("/api/threads/t1")).json();
    const r = await form({ body: "reply pic" }, PNG);
    expect(r.status).toBe(201);
    expect(((await r.json()) as any).post.image_url).toMatch(/^\/api\/u\//);
    const after: any = await (await call("/api/threads/t1")).json();
    expect(after.thread.img_count).toBe(before.thread.img_count + 1);
  });

  it("rejects non-images by content, ignoring claimed type", async () => {
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    const r = await form({ board: "uap", op_body: "evil" }, svg, "image/png");
    expect(r.status).toBe(400);
  });

  it("rejects images over 8 MB", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await form({ board: "uap", op_body: "big" }, big)).status).toBe(413);
  });

  it("serve route only reaches uploads/", async () => {
    expect((await call("/api/u/..%2Fsecret.png")).status).toBe(404);
    expect((await call("/api/u/00000000-0000-0000-0000-000000000000.png")).status).toBe(404);
  });
});
