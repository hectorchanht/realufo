import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { NOT_COVERED } from "../lib/ask";

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
  await env.DB.prepare("DELETE FROM ask_cache").run();
});

describe("GET /api/ask", () => {
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

const recent = (extra: Record<string, unknown> = {}) =>
  worker.fetch(new Request("https://x/api/ask/recent"), { ...env, FEATURE_ASK: "on", AI, VECTORIZE, ...extra } as any, {} as any);

describe("GET /api/ask/recent", () => {
  const put = (key: string, answer: string, age: string) =>
    env.DB.prepare("INSERT INTO ask_cache(key,answer,created_at) VALUES(?,?,datetime('now',?))").bind(key, answer, age);

  it("lists answered questions newest first, current threshold only, no AI calls", async () => {
    await env.DB.batch([
      put("0.45|older question", JSON.stringify({ question: "Older Question", answer: "a [1]", sources: [{ n: 1 }] }), "-2 hours"),
      put("0.45|newer question?", JSON.stringify({ question: "Newer Question?", answer: "b [1][2]", sources: [{ n: 1 }, { n: 2 }] }), "-1 hours"),
      put("0.45|legacy lowercase", JSON.stringify({ answer: "c [1]", sources: [{ n: 1 }] }), "-3 hours"),
      put("0.5|other threshold", JSON.stringify({ question: "Other", answer: "d", sources: [{ n: 1 }] }), "-1 hours"),
      put("0.45|broken row", "not json", "-1 hours"),
      put("0.45|stale question", JSON.stringify({ question: "Stale", answer: "e", sources: [{ n: 1 }] }), "-8 days"),
    ]);
    aiCalls = [];
    const r = await recent();
    expect(r.status).toBe(200);
    const b = await body(r);
    expect(b.recent.map((x: any) => [x.question, x.sources])).toEqual([
      ["Newer Question?", 2],
      ["Older Question", 1],
      ["legacy lowercase", 1],
    ]);
    expect(typeof b.recent[0].asked_at).toBe("string");
    expect(aiCalls).toEqual([]);
  });

  it("a real answer shows up in the recent list", async () => {
    await ask("What did radar see?");
    const b = await body(await recent());
    expect(b.recent.map((x: any) => x.question)).toEqual(["What did radar see?"]);
  });

  it("returns 503 when FEATURE_ASK is off, serves when hidden", async () => {
    expect((await recent({ FEATURE_ASK: "off" })).status).toBe(503);
    expect((await recent({ FEATURE_ASK: "hidden" })).status).toBe(200);
  });
});
