import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { parsePoll } from "../routes/polls";

const POLL = { q: "Balloon or craft?", opts: ["Balloon", "Drone", "Unknown craft", "Need more data"] };
beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll) VALUES ('pt','T','B',?)").bind(JSON.stringify(POLL)).run();
  await env.DB.prepare("INSERT INTO articles(slug,title,body) VALUES ('nopoll','T','B')").run();
  await env.DB.prepare("INSERT INTO articles(slug,title,body,poll) VALUES ('bad','T','B','{\"q\":\"x\",\"opts\":[\"only one\"]}')").run();
});
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const get = async (anon: string, slug = "pt") => call(`/api/articles/${slug}/poll`, { headers: { "X-Anon-Id": anon } });
const cast = (opt: unknown, anon: string | null = "p1", slug = "pt") =>
  call(`/api/articles/${slug}/poll`, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify({ opt }) });

describe("parsePoll", () => {
  it("accepts a valid poll and trims", () => {
    expect(parsePoll(JSON.stringify({ q: " Q? ", opts: [" a ", "b"] }))).toEqual({ q: "Q?", opts: ["a", "b"] });
  });
  it("rejects malformed or rule-breaking polls", () => {
    for (const raw of [null, "", "not json", "[]", '{"q":"","opts":["a","b"]}', '{"q":"Q","opts":["a"]}',
      '{"q":"Q","opts":["a","b","c","d","e"]}', '{"q":"Q","opts":["a","a"]}', '{"q":"Q","opts":["a",""]}',
      JSON.stringify({ q: "Q", opts: ["a", "x".repeat(26)] }), JSON.stringify({ q: "x".repeat(101), opts: ["a", "b"] }),
      '{"q":"Q","opts":["a",2]}'])
      expect(parsePoll(raw as any)).toBeNull();
  });
});

describe("story poll API", () => {
  it("GET: question + total, no tally before voting, no-store", async () => {
    const r = await get("fresh");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ ...POLL, mine: null, total: 0, social: [] });
  });

  it("404 for a story without a poll, an unknown story, or a malformed poll", async () => {
    expect((await get("a", "nopoll")).status).toBe(404);
    expect((await get("a", "nope")).status).toBe(404);
    expect((await get("a", "bad")).status).toBe(404);
    expect((await cast(0, "a", "nopoll")).status).toBe(404);
  });

  it("cast → switch → same again clears", async () => {
    let j: any = await (await cast(0)).json();
    expect(j).toMatchObject({ mine: 0, total: 1, tally: [1, 0, 0, 0] });
    j = await (await cast(2)).json();
    expect(j).toMatchObject({ mine: 2, total: 1, tally: [0, 0, 1, 0] });
    j = await (await cast(2)).json();
    expect(j).toMatchObject({ mine: null, total: 0, tally: [0, 0, 0, 0] });
  });

  it("GET shows the tally only to a voter", async () => {
    await cast(1, "p2");
    await cast(3, "p3");
    expect(await (await get("p2")).json()).toMatchObject({ mine: 1, total: 2, tally: [0, 1, 0, 1] });
    const anon: any = await (await get("nobody")).json();
    expect(anon).toMatchObject({ mine: null, total: 2 });
    expect(anon.tally).toBeUndefined();
  });

  it("social results are public, in opts order, closed flag; rows without counts are left out", async () => {
    await env.DB.prepare(
      "INSERT INTO poll_social(slug,platform,remote_id,status,counts,total) VALUES ('pt','x','T1','closed','[40,30,20,10]',100)"
    ).run();
    await env.DB.prepare("INSERT INTO poll_social(slug,platform,status) VALUES ('pt','threads','pending')").run();
    expect(((await (await get("nobody")).json()) as any).social).toEqual([{ platform: "x", counts: [40, 30, 20, 10], total: 100, closed: true }]);
    await env.DB.prepare("DELETE FROM poll_social WHERE slug='pt'").run();
  });

  it("rejects bad input", async () => {
    for (const opt of [7, -1, 1.5, "1", null, undefined]) expect((await cast(opt)).status).toBe(400);
    expect((await cast(0, null)).status).toBe(400);
    expect((await call("/api/articles/pt/poll", { method: "POST", headers: { "X-Anon-Id": "p1" }, body: "not json" })).status).toBe(400);
  });

  it("429s past the shared vote limit", async () => {
    const env1 = { ...env, RATE_MAX: "1" } as any;
    const post = () =>
      worker.fetch(new Request("https://x/api/articles/pt/poll", { method: "POST", headers: { "X-Anon-Id": "spam" }, body: JSON.stringify({ opt: 0 }) }), env1, {} as any);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });
});
