import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { NOT_COVERED } from "../lib/ask";
import { saltedHash } from "../lib/anon";

beforeAll(() => seedTestDB(env.DB));

// Fakes: Vectorize has no local simulator, and AI calls must be counted.
let aiCalls: { model: string; input: any }[] = [];
let llmOut: unknown = { response: "Radar tracked it [1]." };
let matches: any[] = [];
const AI = {
  run: async (model: string, input: any) => {
    aiCalls.push({ model, input });
    if (model.includes("bge-m3")) return { data: [Array(1024).fill(0.01)] };
    if (llmOut instanceof Error) throw llmOut;
    return llmOut;
  },
};
const VECTORIZE = { query: async () => ({ matches, count: matches.length }) };
const hit = (record_id: string, page: number, score = 0.8) => ({
  id: `${record_id}-${page}`, score, metadata: { record_id, page, text: `text of ${record_id} p${page}` },
});

const ask = (q: string, extra: Record<string, unknown> = {}, anon = "asker") =>
  worker.fetch(
    new Request("https://x/api/ask?q=" + encodeURIComponent(q), { headers: { "X-Anon-Id": anon } }),
    { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any,
    {} as any
  );
const body = async (r: Response) => (await r.json()) as any;

beforeEach(async () => {
  aiCalls = [];
  llmOut = { response: "Radar tracked it [1]." };
  matches = [hit("CIA-UAP-017", 2)];
  await env.DB.batch([env.DB.prepare("DELETE FROM ask_cache"), env.DB.prepare("DELETE FROM ask_log")]);
});

describe("GET /api/ask", () => {
  it("sources link their live hubs, on fresh answers and on cache hits", async () => {
    matches = [hit("FBI-UAP-D002", 1)];
    const fresh = await body(await ask("what did the fbi report?"));
    expect(fresh.sources[0].hubs).toEqual({ agency: "fbi", release: "2", decade: "2020s" });
    const row = await env.DB.prepare("SELECT answer FROM ask_cache").first<{ answer: string }>();
    expect(JSON.parse(row!.answer).sources[0].hubs).toBeUndefined(); // links are not frozen into the cache
    const again = await body(await ask("what did the fbi report?"));
    expect(again.cached).toBe(true);
    expect(again.sources[0].hubs).toEqual({ agency: "fbi", release: "2", decade: "2020s" });
  });

  it("answers with hydrated, cited sources and caches the answer", async () => {
    const r = await ask("what did radar see?");
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.answer).toBe("Radar tracked it [1].");
    expect(b.cached).toBe(false);
    expect(b.sources).toEqual([
      expect.objectContaining({ n: 1, record_id: "CIA-UAP-017", page: 2, kind: expect.any(String), title: expect.any(String) }),
    ]);
    const llm = aiCalls.find((c) => c.model.includes("qwen3"))!;
    expect(llm.input.messages[1].content).toContain("[1] CIA-UAP-017 · p.2");
    expect(llm.input.max_tokens).toBe(400);
  });

  it("returns and caches the question in its original case", async () => {
    const b = await body(await ask("  What Did RADAR See?  "));
    expect(b.question).toBe("What Did RADAR See?");
    const row = await env.DB.prepare("SELECT answer FROM ask_cache").first<{ answer: string }>();
    expect(JSON.parse(row!.answer).question).toBe("What Did RADAR See?");
  });

  it("same question with different case/spacing is a free cache hit", async () => {
    await ask("  What did   RADAR see? ");
    aiCalls = [];
    const b = await body(await ask("what did radar see?"));
    expect(b.cached).toBe(true);
    expect(b.answer).toBe("Radar tracked it [1].");
    expect(aiCalls).toEqual([]);
  });

  it("changing ASK_MIN_SCORE does not serve answers cached under the old threshold", async () => {
    await ask("tuning question");
    aiCalls = [];
    const b = await body(await ask("tuning question", { ASK_MIN_SCORE: "0.5" }));
    expect(b.cached).toBe(false);
    expect(aiCalls.length).toBeGreaterThan(0);
  });

  it("weak retrieval returns not-covered without calling the LLM", async () => {
    matches = [hit("CIA-UAP-017", 1, 0.2)];
    const b = await body(await ask("who built the pyramids?"));
    expect(b).toMatchObject({ answer: NOT_COVERED, sources: [] });
    expect(aiCalls.map((c) => c.model)).toEqual(["@cf/baai/bge-m3"]);
  });

  it("not-covered answers are not cached, so they recover once the index fills in", async () => {
    matches = [];
    expect((await body(await ask("gulf of oman orbs"))).answer).toBe(NOT_COVERED);
    matches = [hit("CIA-UAP-017", 2)];
    const b = await body(await ask("gulf of oman orbs"));
    expect(b.cached).toBe(false);
    expect(b.answer).toBe("Radar tracked it [1].");
  });

  it("drops sources whose record no longer exists; none left -> not covered", async () => {
    matches = [hit("DELETED-RECORD", 1)];
    const b = await body(await ask("ghost record question"));
    expect(b).toMatchObject({ answer: NOT_COVERED, sources: [] });
    expect(aiCalls.some((c) => c.model.includes("qwen3"))).toBe(false);
  });

  it("empty or thinking-only model output becomes not-covered, never a blank card", async () => {
    llmOut = { response: "<think>let me think" };
    expect(await body(await ask("blank output question"))).toMatchObject({ answer: NOT_COVERED, sources: [] });
    llmOut = { choices: [{ message: { content: "" } }] };
    expect(await body(await ask("empty output question"))).toMatchObject({ answer: NOT_COVERED, sources: [] });
  });

  it("strips citations to sources that do not exist and lists only cited ones", async () => {
    matches = [hit("CIA-UAP-017", 1), hit("CIA-UAP-017", 4)];
    llmOut = { response: "Seen at night [2] and [7]." };
    const b = await body(await ask("citation cleanup question"));
    expect(b.answer).toBe("Seen at night [2] and.");      // " [7]" removed with its space
    expect(b.sources.map((s: any) => s.n)).toEqual([2]);
  });

  it("rejects too-short and too-long questions", async () => {
    expect((await ask("  a ")).status).toBe(400);
    expect((await ask("x".repeat(301))).status).toBe(400);
  });

  it("returns 503 when FEATURE_ASK is off, serves when hidden", async () => {
    expect((await ask("flag question", { FEATURE_ASK: "off" })).status).toBe(503);
    expect((await ask("flag question", { FEATURE_ASK: undefined })).status).toBe(503);
    expect((await ask("flag question", { FEATURE_ASK: "hidden" })).status).toBe(200);
  });

  it("daily cap counts browser rows only and stops before any AI call", async () => {
    await env.DB.prepare("DELETE FROM rate_events WHERE action='ask'").run();
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO rate_events(actor_id,action,created_at) VALUES('a1','ask',?)").bind(now),
      env.DB.prepare("INSERT INTO rate_events(actor_id,action,created_at) VALUES('ip:x','ask',?)").bind(now),
    ]);
    expect((await ask("cap question one", { ASK_DAILY_MAX: "2" })).status).toBe(200); // 1 browser row < 2
    aiCalls = [];
    const r = await ask("cap question two", { ASK_DAILY_MAX: "2" });                   // now 2 browser rows
    expect(r.status).toBe(503);
    expect((await body(r)).error).toBe("Ask is resting — try again later");
    expect(aiCalls).toEqual([]);
  });

  it("per-browser rate limit returns 429", async () => {
    const lim = { RATE_MAX: "1", ASK_DAILY_MAX: "100000" };
    expect((await ask("limit question one", lim, "fast")).status).toBe(200);
    const r = await ask("limit question two", lim, "fast");
    expect(r.status).toBe(429);
    expect((await body(r)).error).toBe("slow down — too many questions");
  });

  it("AI failure returns 503, not 500", async () => {
    llmOut = new Error("quota");
    expect((await ask("failure question")).status).toBe(503);
  });
});

const share = (id: unknown, pub: unknown, anon: string | null = "asker", extra: Record<string, unknown> = {}) =>
  worker.fetch(
    new Request(`https://x/api/ask/${id}/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(anon ? { "X-Anon-Id": anon } : {}) },
      body: JSON.stringify({ public: pub }),
    }),
    { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any,
    {} as any
  );

describe("ask_log", () => {
  it("logs every answered, cached and not-covered ask, private by default", async () => {
    const a = await body(await ask("What did radar see?"));
    const c = await body(await ask("what did radar see?"));
    matches = [];
    const n = await body(await ask("who built the pyramids?"));
    expect([a.log_id, c.log_id, n.log_id].every((x) => typeof x === "number")).toBe(true);
    const rows = await env.DB.prepare("SELECT question,sources,cached,public FROM ask_log ORDER BY id").all();
    expect(rows.results).toEqual([
      { question: "What did radar see?", sources: 1, cached: 0, public: 0 },
      { question: "what did radar see?", sources: 1, cached: 1, public: 0 },
      { question: "who built the pyramids?", sources: 0, cached: 0, public: 0 },
    ]);
  });

  it("stores the answer and its sources (no hub links) on fresh, cached and not-covered asks", async () => {
    matches = [hit("FBI-UAP-D002", 1)];
    await ask("What did the FBI report?");
    await ask("what did the fbi report?");
    matches = [];
    await ask("who built the pyramids?");
    const rows = (await env.DB.prepare("SELECT answer FROM ask_log ORDER BY id").all<{ answer: string }>()).results.map((r) =>
      JSON.parse(r.answer)
    );
    expect(rows[0].answer).toBe("Radar tracked it [1].");
    expect(rows[0].sources).toEqual([expect.objectContaining({ n: 1, record_id: "FBI-UAP-D002", page: 1 })]);
    expect(rows[0].sources[0].hubs).toBeUndefined();
    expect(rows[1]).toEqual(rows[0]); // cache hit stores the same frozen answer
    expect(rows[2]).toEqual({ answer: NOT_COVERED, sources: [] });
  });

  it("cache hits over the browser's limit are served but not logged", async () => {
    const lim = { RATE_MAX: "1", ASK_DAILY_MAX: "100000" };
    await ask("hit limit question", lim, "hitter");
    expect((await body(await ask("hit limit question", lim, "hitter"))).log_id).not.toBeNull(); // first ask_hit
    const b = await body(await ask("hit limit question", lim, "hitter"));
    expect(b.cached).toBe(true);
    expect(b.log_id).toBeNull();
  });
});

describe("POST /api/ask/:id/public", () => {
  it("only the asker can share an answered question, and can unshare it", async () => {
    const { log_id } = await body(await ask("What did radar see?"));
    expect((await share(log_id, true, "someone-else")).status).toBe(404);
    expect((await share(log_id, true, null)).status).toBe(404);
    expect((await share(log_id, "yes")).status).toBe(400);
    expect(await body(await share(log_id, true))).toEqual({ public: true, url: `/ask/${log_id}-what-did-radar-see` });
    expect((await env.DB.prepare("SELECT public FROM ask_log WHERE id=?").bind(log_id).first())!.public).toBe(1);
    expect(await body(await share(log_id, false))).toEqual({ public: false, url: `/ask/${log_id}-what-did-radar-see` });
  });

  it("rows logged before answers were stored (answer NULL) cannot be shared", async () => {
    const actor = await saltedHash("asker", env.ANON_SALT);
    const row = await env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources) VALUES('old question',?,2) RETURNING id")
      .bind(actor)
      .first<{ id: number }>();
    expect((await share(row!.id, true)).status).toBe(404);
  });

  it("not-covered and unknown questions cannot be shared", async () => {
    matches = [];
    const { log_id } = await body(await ask("who built the pyramids?"));
    expect((await share(log_id, true)).status).toBe(404);
    expect((await share(999999, true)).status).toBe(404);
    expect((await share("abc", true)).status).toBe(404);
  });
});

const recent = (extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request("https://x/api/ask/recent"), { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any, {} as any);

describe("GET /api/ask/recent", () => {
  const put = (question: string, pub: number, sources = 1, answer: string | null = null) =>
    env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,public,answer) VALUES(?,'a',?,?,?)").bind(question, sources, pub, answer);

  it("each entry links the earliest answered public row of its question; unanswered rows get no url", async () => {
    const a = JSON.stringify({ answer: "x [1]", sources: [] });
    await env.DB.batch([
      put("Gimbal video?", 1, 1, a),
      put("gimbal video?", 1, 1, a),
      put("Old question", 1, 1, null),
    ]);
    const ids = (await env.DB.prepare("SELECT id FROM ask_log ORDER BY id").all<{ id: number }>()).results.map((r) => r.id);
    const b = await body(await recent());
    expect(b.recent).toEqual([
      expect.objectContaining({ id: ids[2], question: "Old question", url: null }),
      expect.objectContaining({ id: ids[0], question: "Gimbal video?", url: `/ask/${ids[0]}-gimbal-video` }),
    ]);
  });

  it("lists only shared questions, newest first, one per distinct question, no AI calls", async () => {
    await env.DB.batch([
      put("Older Question", 1),
      put("Private Question", 0),
      put("older question", 1, 3),
      put("Newer Question?", 1, 2),
    ]);
    aiCalls = [];
    const r = await recent();
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.recent.map((x: any) => [x.question, x.sources])).toEqual([
      ["Newer Question?", 2],
      ["older question", 3],
    ]);
    expect(typeof b.recent[0].asked_at).toBe("string");
    expect(aiCalls).toEqual([]);
  });

  it("an answer appears only after its asker shares it", async () => {
    const { log_id } = await body(await ask("What did radar see?"));
    expect((await body(await recent())).recent).toEqual([]);
    await share(log_id, true);
    expect((await body(await recent())).recent.map((x: any) => x.question)).toEqual(["What did radar see?"]);
  });

  it("returns 503 when FEATURE_ASK is off, serves when hidden", async () => {
    expect((await recent({ FEATURE_ASK: "off" })).status).toBe(503);
    expect((await recent({ FEATURE_ASK: "hidden" })).status).toBe(200);
  });
});

const sharedAsk = (id: string, extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request(`https://x/api/asks/${id}`), { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any, {} as any);

describe("GET /api/asks/:id", () => {
  const frozen = JSON.stringify({
    answer: "Radar tracked it [1].",
    sources: [{ n: 1, record_id: "FBI-UAP-D002", title: "FBI file", page: 1, kind: "pdf", thumb: null }],
  });
  const put = (question: string, pub: number, answer: string | null) =>
    env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,public,answer) VALUES(?,'a',1,?,?) RETURNING id")
      .bind(question, pub, answer)
      .first<{ id: number }>();

  it("returns a shared answer with live hub links and its URL, without AI calls", async () => {
    const row = await put("What did the FBI report?", 1, frozen);
    aiCalls = [];
    const r = await sharedAsk(`${row!.id}-what-did-the-fbi-report`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=300");
    const b = await body(r);
    expect(b).toMatchObject({ id: row!.id, question: "What did the FBI report?", answer: "Radar tracked it [1].", url: `/ask/${row!.id}-what-did-the-fbi-report` });
    expect(typeof b.asked_at).toBe("string");
    expect(b.sources[0]).toMatchObject({ record_id: "FBI-UAP-D002", hubs: { agency: "fbi" } });
    expect(aiCalls).toEqual([]);
  });

  it("404s for private, unanswered, corrupt, unknown and non-numeric ids", async () => {
    const priv = await put("private one", 0, frozen);
    const old = await put("old one", 1, null);
    const bad = await put("corrupt one", 1, "{not json");
    for (const id of [String(priv!.id), String(old!.id), String(bad!.id), "999999", "abc", "x-1"])
      expect((await sharedAsk(id)).status).toBe(404);
  });

  it("still serves shared answers when FEATURE_ASK is off", async () => {
    const row = await put("flag off question", 1, frozen);
    expect((await sharedAsk(String(row!.id), { FEATURE_ASK: "off" })).status).toBe(200);
  });
});
