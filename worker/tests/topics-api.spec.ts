import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { topicMembers } from "../routes/hubs";
import { TOPIC_TEXT } from "../lib/topicText";

const SRC = TOPIC_TEXT.aawsap.sources[0].id; // a real source id, inserted below as a member
beforeAll(async () => {
  await seedTestDB(env.DB);
  const ins = env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)");
  await env.DB.batch([
    ...[1, 2, 3, 4].map((n) => ins.bind(`TOPIC-T${n}`, "wargov", "DoW", `TOPIC-T${n}, AAWSAP DIRD, Test ${n}`, "x", "pdf", "live")),
    ins.bind(SRC, "wargov", "DoW", `${SRC}, AAWSAP source file`, "x", "pdf", "live"),
    ins.bind("TOPIC-DEAD", "wargov", "DoW", "TOPIC-DEAD, AAWSAP DIRD, withdrawn", "x", "pdf", "failed"),
    ins.bind("DOW-UAP-D126", "wargov", "DoW", "DOW-UAP-D126, propulsion", "nuclear propulsion study", "pdf", "live"),
    ins.bind("DOW-UAP-D094", "wargov", "DoW", "DOW-UAP-D094, Analysis of Flying Object Incidents", "x", "pdf", "live"),
    env.DB.prepare("INSERT INTO articles(slug,title,body,thread_id) VALUES ('tstory','Test story','B','ar_tstory')"),
    env.DB.prepare("INSERT INTO article_records(slug,record_id,pos,label,evidence) VALUES ('tstory','TOPIC-T1',0,'L','E')"),
  ]);
});

const call = async (path: string, over: Record<string, unknown> = {}) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://topics.test" + path), { ...env, ...over } as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("topic membership", () => {
  it("applies rules, live filter, include and exclude", async () => {
    const m = await topicMembers(env as any, "https://members.test");
    expect(m.aawsap).toEqual(expect.arrayContaining(["TOPIC-T1", "TOPIC-T2", "TOPIC-T3", "TOPIC-T4", SRC]));
    expect(m.aawsap).not.toContain("TOPIC-DEAD");
    expect(m["nuclear-sites"]).toContain("DOW-UAP-D094");      // include
    expect(m["nuclear-sites"]).not.toContain("DOW-UAP-D126");  // exclude beats the rule
    expect(m["nuclear-sites"]).not.toContain("DOW-UAP-D017");  // include of a missing id is ignored
  });
});

describe("topic hub API", () => {
  it("lists topic hubs with ≥ 5 files, after releases", async () => {
    const { hubs } = (await (await call("/api/hubs")).json()) as any;
    const keys = hubs.map((h: any) => `${h.kind}/${h.slug}`);
    expect(keys).toContain("topic/aawsap");
    expect(keys).not.toContain("topic/police");
    expect(keys.indexOf("release/2")).toBeLessThan(keys.indexOf("topic/aawsap"));
    expect(keys.indexOf("topic/aawsap")).toBeLessThan(keys.indexOf("agency/department-of-war"));
  });

  it("topic hub: title, members, background, sources (live only), stories", async () => {
    const res = await call("/api/hubs/topic/aawsap");
    expect(res.status).toBe(200);
    const h: any = await res.json();
    expect(h.title).toMatch(/^AAWSAP & the DIRD Reports: \d+ Declassified UFO Files$/);
    expect(h.intro).toMatch(/declassified UAP files on this topic: /);
    expect(h.records.map((r: any) => r.id)).toEqual(expect.arrayContaining(["TOPIC-T1", SRC]));
    expect(h.topic.background).toBe(TOPIC_TEXT.aawsap.background);
    expect(h.topic.sources.map((s: any) => s.id)).toEqual([SRC]); // the other sources aren't in the test DB
    expect(h.topic.sources[0].title).toContain("AAWSAP source file");
    expect(h.topic.stories).toEqual([{ slug: "tstory", title: "Test story", threadId: "ar_tstory" }]);
  });

  it("small topics 404; other kinds have no topic block", async () => {
    expect((await call("/api/hubs/topic/police")).status).toBe(404);
    expect((await call("/api/hubs/topic/nope")).status).toBe(404);
    const fbi: any = await (await call("/api/hubs/agency/fbi")).json();
    expect(fbi).not.toHaveProperty("topic");
  });

  it("doc detail lists its live topics; non-members get none", async () => {
    const d: any = await (await call("/api/records/TOPIC-T1")).json();
    expect(d.topics).toEqual([{ slug: "aawsap", label: "AAWSAP & DIRDs" }]);
    const n: any = await (await call("/api/records/DOW-UAP-D094")).json();
    expect(n.topics).toEqual([]); // nuclear-sites has < 5 members here
  });

  it("a failing topic query leaves doc pages working with no topics", async () => {
    const DB = { prepare: (sql: string) => (sql.includes("LIKE ?") && sql.includes("SELECT r.id FROM records r") ? (() => { throw new Error("D1 down"); })() : env.DB.prepare(sql)), batch: env.DB.batch.bind(env.DB) };
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://topicfail.test/api/records/TOPIC-T1"), { ...env, DB } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).topics).toEqual([]);
  });

  it("a failing topic query drops topics but keeps the rest of the hub list", async () => {
    const DB = { prepare: (sql: string) => (sql.includes("SELECT r.id FROM records r") ? (() => { throw new Error("D1 down"); })() : env.DB.prepare(sql)), batch: env.DB.batch.bind(env.DB) };
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://hublistfail.test/api/hubs"), { ...env, DB } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const keys = ((await res.json()) as any).hubs.map((h: any) => `${h.kind}/${h.slug}`);
    expect(keys).toContain("release/1");
    expect(keys.some((k: string) => k.startsWith("topic/"))).toBe(false);
  });

  it("a failing stories query still serves the topic page, without stories", async () => {
    const DB = { prepare: (sql: string) => (sql.includes("FROM articles a JOIN article_records") ? (() => { throw new Error("D1 down"); })() : env.DB.prepare(sql)), batch: env.DB.batch.bind(env.DB) };
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://storiesfail.test/api/hubs/topic/aawsap"), { ...env, DB } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const h: any = await res.json();
    expect(h.topic.stories).toEqual([]);
    expect(h.topic.background).toBe(TOPIC_TEXT.aawsap.background);
  });

  it("hub_highlights accepts kind='topic' after the migration", async () => {
    await env.DB.prepare("INSERT INTO hub_highlights(kind,slug,lede,picks,members_hash) VALUES ('topic','aawsap','L','[]','h')").run();
    const row = await env.DB.prepare("SELECT kind FROM hub_highlights WHERE kind='topic' AND slug='aawsap'").first();
    expect(row).toEqual({ kind: "topic" });
  });
});
