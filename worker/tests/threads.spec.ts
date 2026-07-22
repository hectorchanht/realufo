import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const post = (p: string, body: any) => call(p, { method: "POST", headers: { "X-Anon-Id": "u1" }, body: JSON.stringify(body) });

describe("threads", () => {
  it("lists board threads", async () => {
    const j: any = await (await call("/api/boards/gov/threads")).json();
    expect(j.board.id).toBe("gov");
    expect(j.threads.length).toBeGreaterThan(0);
    expect(j.threads[0]).toHaveProperty("boardSlug");
    expect(j.threads[0]).toHaveProperty("ago");
    expect(Array.isArray(j.threads[0].tags)).toBe(true);
  });

  it("404s an unknown board", async () => {
    expect((await call("/api/boards/nope/threads")).status).toBe(404);
  });

  it("thread detail returns source record chip when promoted", async () => {
    const j: any = await (await call("/api/threads/t1")).json(); // t1.rec = CIA-UAP-017
    expect(j.thread.id).toBe("t1");
    expect(j.sourceRecord.id).toBe("CIA-UAP-017");
    expect(j.posts.length).toBeGreaterThanOrEqual(1);
    expect(j.posts[0].isOp).toBe(true);
  });

  it("404s an unknown thread", async () => {
    expect((await call("/api/threads/nope")).status).toBe(404);
  });

  it("rejects empty op_body", async () => {
    const r = await post("/api/threads", { board: "uap", op_body: "   " });
    expect(r.status).toBe(400);
  });

  it("rejects a non-string op_body instead of throwing", async () => {
    const r = await post("/api/threads", { board: "uap", op_body: 123 });
    expect(r.status).toBe(400);
  });

  it("400s an unknown board on create", async () => {
    const r = await post("/api/threads", { board: "nope", op_body: "hello" });
    expect(r.status).toBe(400);
  });

  it("promotes: POST /threads with source_record_id creates bidirectional link", async () => {
    const j: any = await (await post("/api/threads", { board: "uap", op_body: "promoted body", source_record_id: "CIA-UAP-017", stance: "believer" })).json();
    const tid = j.thread.id;
    expect(tid).toBeTruthy();
    expect(typeof j.thread.created_at).toBe("string");
    expect(j.thread.created_at.length).toBeGreaterThan(0);
    expect(j.thread.boardSlug).toBeDefined();
    expect(j.thread.accent).toBeDefined();

    // record -> thread direction
    const back: any = await (await call("/api/records/CIA-UAP-017")).json();
    expect(back.promotedThreads.some((t: any) => t.id === tid)).toBe(true);

    // thread -> record direction
    const det: any = await (await call("/api/threads/" + tid)).json();
    expect(det.sourceRecord.id).toBe("CIA-UAP-017");
    expect(det.thread.title).toBe("promoted body");
    expect(det.posts.length).toBe(1);
    expect(det.posts[0].isOp).toBe(true);
    expect(det.posts[0].source_record_id).toBe("CIA-UAP-017");
  });

  it("falls back title to first line of op_body, truncated to 70 chars", async () => {
    const longLine = "x".repeat(90);
    const j: any = await (await post("/api/threads", { board: "uap", op_body: longLine + "\nsecond line" })).json();
    expect(j.thread.title.length).toBeLessThanOrEqual(70);
    expect(j.thread.title).toBe(longLine.slice(0, 70));
  });

  it("caps a client-supplied title at 120 chars", async () => {
    const longTitle = "y".repeat(200);
    const j: any = await (await post("/api/threads", { board: "uap", op_body: "body", title: longTitle })).json();
    expect(j.thread.title.length).toBe(120);
    expect(j.thread.title).toBe(longTitle.slice(0, 120));
  });

  it("reply increments reply_count", async () => {
    const before: any = await (await call("/api/threads/t1")).json();
    const r = await post("/api/threads/t1/posts", { body: "a reply" });
    expect(r.status).toBe(201);
    const rj: any = await r.json();
    expect(typeof rj.post.created_at).toBe("string");
    const after: any = await (await call("/api/threads/t1")).json();
    expect(after.posts.length).toBe(before.posts.length + 1);
    expect(after.thread.reply_count).toBe(before.thread.reply_count + 1);
  });

  it("404s replying to an unknown thread", async () => {
    const r = await post("/api/threads/nope/posts", { body: "hi" });
    expect(r.status).toBe(404);
  });

  it("rejects empty reply body", async () => {
    const r = await post("/api/threads/t1/posts", { body: "   " });
    expect(r.status).toBe(400);
  });

  it("rejects a non-string reply body instead of throwing", async () => {
    const r = await post("/api/threads/t1/posts", { body: 123 });
    expect(r.status).toBe(400);
  });
});
