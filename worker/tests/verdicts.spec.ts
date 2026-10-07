import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));
const ID = "CIA-UAP-017";
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const cast = (verdict: unknown, anon: string | null = "v1", id = ID) =>
  call(`/api/records/${encodeURIComponent(id)}/verdict`, {
    method: "POST",
    headers: anon ? { "X-Anon-Id": anon } : {},
    body: JSON.stringify({ verdict }),
  });
const detail = async (anon: string) =>
  ((await (await call(`/api/records/${ID}`, { headers: { "X-Anon-Id": anon } })).json()) as any).verdicts;

describe("file verdicts", () => {
  it("hides the split until the visitor votes", async () => {
    expect(await detail("fresh")).toEqual({ mine: null, total: 0 });
  });

  it("cast → change → same again clears", async () => {
    let j: any = await (await cast("explained")).json();
    expect(j).toEqual({ mine: "explained", total: 1, tally: { explained: 1, unexplained: 0, more_data: 0 } });
    j = await (await cast("unexplained")).json();
    expect(j).toEqual({ mine: "unexplained", total: 1, tally: { explained: 0, unexplained: 1, more_data: 0 } });
    j = await (await cast("unexplained")).json();
    expect(j).toEqual({ mine: null, total: 0, tally: { explained: 0, unexplained: 0, more_data: 0 } });
  });

  it("GET shows tally only to a visitor who voted", async () => {
    await cast("more_data", "v2");
    await cast("explained", "v3");
    expect(await detail("v2")).toEqual({ mine: "more_data", total: 2, tally: { explained: 1, unexplained: 0, more_data: 1 } });
    expect(await detail("nobody")).toEqual({ mine: null, total: 2 });
  });

  it("one row per visitor even when two verdicts land back to back", async () => {
    const count = async () =>
      (await env.DB.prepare("SELECT count(*) c FROM record_verdicts WHERE record_id=?").bind(ID).first<{ c: number }>())!.c;
    const before = await count();
    await Promise.all([cast("explained", "race"), cast("unexplained", "race")]);
    expect(await count()).toBe(before + 1);
  });

  it("rejects bad input", async () => {
    expect((await cast("aliens")).status).toBe(400);
    expect((await cast("constructor")).status).toBe(400);
    expect((await cast("explained", null)).status).toBe(400);
    expect((await call(`/api/records/${ID}/verdict`, { method: "POST", headers: { "X-Anon-Id": "v1" }, body: "not json" })).status).toBe(400);
    expect((await cast("explained", "v1", "NOPE")).status).toBe(404);
  });

  it("429s past the shared vote limit", async () => {
    const env1 = { ...env, RATE_MAX: "1" } as any;
    const post = () =>
      worker.fetch(
        new Request(`https://x/api/records/${ID}/verdict`, { method: "POST", headers: { "X-Anon-Id": "spam" }, body: JSON.stringify({ verdict: "explained" }) }),
        env1,
        {} as any
      );
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
  });
});

describe("wtf leaderboard sorts", () => {
  const orderOf = async (sort: string) =>
    (((await (await call(`/api/records?sort=${sort}&limit=100`)).json()) as any).records as any[]).map((r) => r.id);
  beforeAll(async () => {
    for (const id of ["WTF-A", "WTF-B", "WTF-C"])
      await env.DB.prepare("INSERT INTO records(id) VALUES(?)").bind(id).run();
    for (const a of ["wa1", "wa2", "wa3"]) await cast("unexplained", a, "WTF-A");
    for (const a of ["wb1", "wb2"]) await cast("unexplained", a, "WTF-B");
    await cast("unexplained", "wc1", "WTF-C");
    // A is 10 days old (in the month window, out of the week window),
    // B is 40 days old (out of both windows).
    await env.DB.prepare("UPDATE record_verdicts SET updated_at=datetime('now','-10 days') WHERE record_id='WTF-A'").run();
    await env.DB.prepare("UPDATE record_verdicts SET updated_at=datetime('now','-40 days') WHERE record_id='WTF-B'").run();
  });

  it("wtf_week only counts the last 7 days", async () => {
    const got = await orderOf("wtf_week");
    expect(got[0]).toBe("WTF-C"); // the only record with in-week unexplained votes
  });

  it("wtf_month counts the last 30 days", async () => {
    const got = await orderOf("wtf_month");
    expect(got[0]).toBe("WTF-A"); // 3 votes, 10 days old
    expect(got[1]).toBe("WTF-C"); // 1 vote, recent
  });

  it("old votes sink below recent ones", async () => {
    const got = await orderOf("wtf_month");
    expect(got.indexOf("WTF-C")).toBeLessThan(got.indexOf("WTF-B")); // B: 0 in-window
  });
});
