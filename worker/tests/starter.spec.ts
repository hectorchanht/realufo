import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('STARTER-1','aaro','AARO','Mystery memo','pdf','live')"
    ),
    env.DB.prepare(
      "INSERT INTO record_text(record_id,pages,total_pages,ai_summary) VALUES('STARTER-1','[]',1,'The memo describes a radar contact that vanished without explanation.')"
    ),
    env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('STARTER-NOSUM','aaro','AARO','No summary memo','pdf','live')"
    ),
    env.DB.prepare("INSERT INTO record_text(record_id,pages,total_pages) VALUES('STARTER-NOSUM','[]',1)"),
  ]);
});

// Fake Workers AI: counts calls, returns the scripted model output.
let aiCalls = 0;
let llmOut: unknown = { response: "What does the vanishing contact imply about the official story?" };
const AI = {
  run: async (_model: string, _input: any) => {
    aiCalls++;
    if (llmOut instanceof Error) throw llmOut;
    return llmOut;
  },
};

const starter = (id: string, q = "", anon = "starter-tester") =>
  worker.fetch(
    new Request(`https://x/api/records/${id}/starter${q}`, { headers: { "X-Anon-Id": anon } }),
    { ...env, AI } as any,
    {} as any
  );
const body = async (r: Response) => (await r.json()) as any;

beforeEach(async () => {
  aiCalls = 0;
  llmOut = { response: "What does the vanishing contact imply about the official story?" };
  await env.DB.prepare("DELETE FROM ask_cache").run();
});

describe("GET /api/records/:id/starter", () => {
  it("generates one question from the AI summary, then serves it from cache", async () => {
    const fresh = await starter("STARTER-1");
    expect(fresh.status).toBe(200);
    const fb = await body(fresh);
    expect(fb.question).toBe("What does the vanishing contact imply about the official story?");
    expect(fb.cached).toBe(false);
    expect(aiCalls).toBe(1);

    const again = await body(await starter("STARTER-1"));
    expect(again.question).toBe(fb.question);
    expect(again.cached).toBe(true);
    expect(aiCalls).toBe(1); // no second generation
  });

  it("caches per language", async () => {
    await body(await starter("STARTER-1"));
    llmOut = { response: "消失嘅雷達接觸代表咩？" };
    const zh = await body(await starter("STARTER-1", "?lang=zh-Hant"));
    expect(zh.question).toBe("消失嘅雷達接觸代表咩？");
    expect(aiCalls).toBe(2);
  });

  it("returns null when the record has no AI summary (and burns no AI call)", async () => {
    const r = await starter("STARTER-NOSUM");
    expect(r.status).toBe(200);
    expect((await body(r)).question).toBeNull();
    expect(aiCalls).toBe(0);
  });

  it("404s on an unknown record", async () => {
    expect((await starter("NOPE-NOT-HERE")).status).toBe(404);
    expect(aiCalls).toBe(0);
  });

  it("rejects non-question model output instead of shipping slop", async () => {
    llmOut = { response: "The memo is quite interesting indeed." };
    const r = await body(await starter("STARTER-1"));
    expect(r.question).toBeNull();
    expect(aiCalls).toBe(1);
  });

  it("strips wrapping quotes from the model output", async () => {
    llmOut = { response: '"Could this have been a weather balloon?"' };
    const r = await body(await starter("STARTER-1"));
    expect(r.question).toBe("Could this have been a weather balloon?");
  });
});
