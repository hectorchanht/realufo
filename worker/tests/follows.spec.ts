import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { actorId } from "../lib/anon";
import { followUrl, hubLabel } from "../lib/follows";

beforeAll(() => seedTestDB(env.DB));
const call = (p: string, init?: RequestInit) => worker.fetch(new Request("https://x" + p, init), env as any, {} as any);
const as = (anon: string | null, p: string, body: unknown) =>
  call(p, { method: "POST", headers: anon ? { "X-Anon-Id": anon } : {}, body: JSON.stringify(body) });
const actor = (anon: string) => actorId(new Request("https://x", { headers: { "X-Anon-Id": anon } }), env.ANON_SALT);
const follows = async (a: string) =>
  (await env.DB.prepare("SELECT kind,key,src FROM follows WHERE actor_id=? ORDER BY kind,key").bind(a).all()).results;

describe("auto-follow on posting", () => {
  it("new thread and reply follow the thread", async () => {
    const t: any = await (await as("fa", "/api/threads", { board: "uap", op_body: "op" })).json();
    expect(await follows(await actor("fa"))).toEqual([{ kind: "thread", key: t.thread.id, src: "auto" }]);
    await as("fb", `/api/threads/${t.thread.id}/posts`, { body: "reply" });
    expect(await follows(await actor("fb"))).toEqual([{ kind: "thread", key: t.thread.id, src: "auto" }]);
  });
  it("record and case comments follow their record/case", async () => {
    await as("fc", "/api/records/CIA-UAP-017/comments", { body: "c" });
    await as("fc", "/api/cases/kaikoura/comments", { body: "c" });
    expect(await follows(await actor("fc"))).toEqual([
      { kind: "case", key: "kaikoura", src: "auto" },
      { kind: "record", key: "CIA-UAP-017", src: "auto" },
    ]);
  });
  it("posting twice keeps one row", async () => {
    await as("fc", "/api/records/CIA-UAP-017/comments", { body: "again" });
    expect((await follows(await actor("fc"))).length).toBe(2);
  });
  it("no anon id → no follow row (and the post still works)", async () => {
    const before = (await env.DB.prepare("SELECT count(*) c FROM follows").first<{ c: number }>())!.c;
    expect((await as(null, "/api/records/CIA-UAP-017/comments", { body: "anon" })).status).toBe(201);
    expect((await env.DB.prepare("SELECT count(*) c FROM follows").first<{ c: number }>())!.c).toBe(before);
  });
});

describe("follow helpers", () => {
  it("followUrl encodes ids (record ids can contain spaces)", () => {
    expect(followUrl("record", "of _Western")).toBe("/doc/of%20_Western");
    expect(followUrl("thread", "ut_ABC")).toBe("/thread/ut_ABC");
    expect(followUrl("case", "kaikoura")).toBe("/case/kaikoura");
    expect(followUrl("hub", "agency/fbi")).toBe("/agency/fbi");
  });
  it("hubLabel knows agency, location and topic hubs, not releases", () => {
    expect(hubLabel("agency/fbi")).toBe("FBI");
    expect(hubLabel("topic/project-blue-book")).toBe("Project Blue Book");
    expect(hubLabel("release/6")).toBeUndefined();
  });
});
