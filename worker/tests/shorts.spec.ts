import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, vi } from "vitest";
import { seedTestDB } from "./helpers";
import { listShorts, queryShorts, clearShortsMemo } from "../routes/shorts";
import worker from "../index";

const rec = (id: string, status = "live", title = `Title ${id}`) =>
  env.DB.prepare("INSERT INTO records(id,archive,agency,kind,title,status,created_at) VALUES (?,'wargov','DoW','video',?,?,?)")
    .bind(id, title, status, `2026-09-0${id.slice(-1)} 00:00:00`).run();
const put = (key: string) => env.MEDIA.put(key, new Uint8Array(1));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("listShorts", () => {
  beforeAll(async () => {
    clearShortsMemo();
    await seedTestDB(env.DB);
    await rec("SH-1"); await rec("SH-2"); await rec("SH-3", "failed"); await rec("SH-4");
    await rec("SH-5", "live", "Gimbal over the sea"); await rec("SH-6"); await rec("SH 7");
    for (const id of ["SH-1", "SH-2", "SH-3"]) await put(`clips-v/wargov/${id}.mp4`);
    for (const id of ["SH-5", "SH-6", "SH-1", "SH 7"]) await put(`showcase/wargov/${id}.mp4`);
    await env.DB.prepare(
      `INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES
       ('showcase','SH-5','Two stars twelve years apart',0,0,'posted','2026-10-03 10:00:00'),
       ('showcase','SH-6','A teardrop over the ocean',0,0,'posted','2026-10-03 11:00:00')`
    ).run();
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime,crop) VALUES ('SH-2','full','x','video/mp4','616:1080:652:0')").run();
  });

  it("showcase first by post time, then twins (portrait first, then newest); live + object only", async () => {
    const s = await listShorts(env as any);
    // SH-6/SH-5 posted; SH-1 and "SH 7" showcase without post row (created_at DESC); SH-2 portrait twin; SH-3 not live; SH-4 no object
    expect(ids(s)).toEqual(["SH-6", "SH-5", "SH 7", "SH-1", "SH-2"]);
  });

  it("showcase wins over its twin, once, served from showcase/; ids are URL-encoded", async () => {
    const s = await listShorts(env as any);
    expect(s.filter((x) => x.id === "SH-1")).toHaveLength(1);
    expect(s.find((x) => x.id === "SH-1")).toMatchObject({ showcase: true, clip: expect.stringMatching(/^https:\/\/assets\.realufo\.org\/showcase\/wargov\/SH-1\.mp4\?v=/) });
    expect(s.find((x) => x.id === "SH 7")!.clip).toMatch(/^https:\/\/assets\.realufo\.org\/showcase\/wargov\/SH%207\.mp4\?v=/);
    expect(s.find((x) => x.id === "SH-2")).toMatchObject({ showcase: false, clip: expect.stringMatching(/^https:\/\/assets\.realufo\.org\/clips-v\/wargov\/SH-2\.mp4\?v=/) });
  });

  it("q matches record title and showcase post text; punctuation-only q matches nothing", async () => {
    expect(ids(await listShorts(env as any, { q: "gimbal" }))).toEqual(["SH-5"]);
    expect(ids(await listShorts(env as any, { q: "teardrop ocean" }))).toEqual(["SH-6"]);
    expect(ids(await listShorts(env as any, { q: "!!" }))).toEqual([]);
  });

  it("q matches page text (record_fts)", async () => {
    await env.DB.prepare("INSERT INTO record_fts(record_id,page,body) VALUES ('SH-2',1,'sonobuoy contact report')").run();
    expect(ids(await listShorts(env as any, { q: "sonobuoy" }))).toEqual(["SH-2"]);
  });

  it("limit caps the list", async () => {
    expect(await listShorts(env as any, { limit: 2 })).toHaveLength(2);
  });

  it("clip URLs carry the object's etag so a replaced Short busts the 1-month CDN cache", async () => {
    const etag = (await env.MEDIA.head("showcase/wargov/SH-1.mp4"))!.etag;
    const s = await listShorts(env as any);
    expect(s.find((x) => x.id === "SH-1")!.clip).toBe(`https://assets.realufo.org/showcase/wargov/SH-1.mp4?v=${etag.slice(0, 8)}`);
  });

  it("offset pages through the same order", async () => {
    const all = ids(await listShorts(env as any));
    expect(ids(await listShorts(env as any, { limit: 2, offset: 2 }))).toEqual(all.slice(2, 4));
  });

  it("total counts every match, not just the page", async () => {
    expect(await queryShorts(env as any, { limit: 2 })).toMatchObject({ total: 5, shorts: expect.any(Array) });
    expect((await queryShorts(env as any, { q: "gimbal" })).total).toBe(1);
    expect((await queryShorts(env as any, { q: "!!" })).total).toBe(0);
  });

  it("a fractional limit is floored, not a SQLite error", async () => {
    expect(await listShorts(env as any, { limit: 2.5 })).toHaveLength(2);
  });

  it("degrades to [] when R2 listing fails, and logs it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = { ...env, MEDIA: { list: () => Promise.reject(new Error("r2 down")) } };
    expect(await listShorts(broken as any)).toEqual([]);
    expect(log).toHaveBeenCalledWith("listShorts", expect.any(Error));
    log.mockRestore();
  });

  it("lists R2 once per bucket for a few minutes (one list per prefix, not per call)", async () => {
    const list = vi.fn((o: R2ListOptions) => env.MEDIA.list(o));
    const counted = { ...env, MEDIA: { list } };
    await listShorts(counted as any);
    await listShorts(counted as any, { q: "gimbal" });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("likes: toggle per visitor, counted in /api/shorts with this visitor's liked; comments counted", async () => {
    const call = async (method: string, p: string, anon?: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request("https://x" + p, { method, headers: anon ? { "X-Anon-Id": anon } : {} }), env as any, ctx);
      await waitOnExecutionContext(ctx);
      return { status: res.status, body: (await res.json()) as any };
    };
    expect((await call("POST", "/api/shorts/SH-5/like")).status).toBe(400);
    expect((await call("POST", "/api/shorts/SH-3/like", "a")).status).toBe(404); // not live
    expect((await call("POST", "/api/shorts/SH-5/like", "a")).body).toEqual({ liked: true, likes: 1 });
    expect((await call("POST", "/api/shorts/SH-5/like", "b")).body).toEqual({ liked: true, likes: 2 });
    expect((await call("POST", "/api/shorts/SH-5/like", "b")).body).toEqual({ liked: false, likes: 1 });
    await env.DB.prepare("INSERT INTO comments(id,no,record_id,body) VALUES ('C1',1,'SH-5','hi'),('C2',2,'SH-5','yo')").run();
    const mine = (await call("GET", "/api/shorts?q=gimbal", "a")).body.shorts[0];
    expect(mine).toMatchObject({ id: "SH-5", likes: 1, liked: true, comments: 2 });
    expect((await call("GET", "/api/shorts?q=gimbal", "b")).body.shorts[0].liked).toBe(false);
    expect((await call("GET", "/api/shorts?q=gimbal")).body.shorts[0].liked).toBe(false);
  });

  it("GET /api/shorts?q= serves { shorts, total }; facets carry the Shorts total; /api/feed clips still come from it", async () => {
    const get = async (p: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request("https://x" + p), env as any, ctx);
      await waitOnExecutionContext(ctx);
      return res.json() as Promise<any>;
    };
    expect(await get("/api/shorts?q=gimbal")).toMatchObject({ shorts: [{ id: "SH-5" }], total: 1 });
    expect((await get("/api/records/facets")).shorts).toBe(5);
    expect(ids((await get("/api/feed")).clips).slice(0, 2)).toEqual(["SH-6", "SH-5"]);
  });

  it("orderMotion: moving first-frames first; showcase row wins for the served kind; unscored last", async () => {
    await env.DB.prepare(
      `INSERT INTO short_motion(record_id, kind, motion, frames, computed_at) VALUES
       ('SH-1','showcase',0.5,16,1), ('SH-1','twin',99.0,16,1),
       ('SH-2','twin',40.0,16,1), ('SH-5','showcase',10.0,16,1)`
    ).run();
    // SH-1 serves the showcase file (0.5), not its twin row (99): 40 > 10 > 0.5,
    // then the unscored SH-6/SH 7 in classic order (posted showcase, then unposted).
    const s = ids(await listShorts(env as any, { orderMotion: true }));
    expect(s).toEqual(["SH-2", "SH-5", "SH-1", "SH-6", "SH 7"]);
    // The classic order is untouched without the flag.
    expect(ids(await listShorts(env as any)).slice(0, 2)).toEqual(["SH-6", "SH-5"]);
  });

  it("orderMotion without the short_motion table falls back to the classic order", async () => {
    await env.DB.prepare("DROP TABLE short_motion").run();
    expect(ids(await listShorts(env as any, { orderMotion: true })).slice(0, 2)).toEqual(["SH-6", "SH-5"]);
  });
});
