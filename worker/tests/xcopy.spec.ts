import { describe, it, expect } from "vitest";
import { weightedLength, stripLinks, finalize, template, draft, mustContain, FORMATS, HOOKS } from "../lib/xcopy";
import type { Candidate, PickRecord } from "../lib/xpick";

const record = (over: Partial<PickRecord> = {}): PickRecord => ({
  id: "DOW-UAP-D012", archive: "wargov", kind: "video", title: "Object over Gulf", agency: "Navy",
  incident_date: "2019", location: "Gulf of Mexico", summary: "FLIR footage.", duration: 42, ...over,
});
const pick = (over: Partial<PickRecord> = {}): Candidate => {
  const r = record(over);
  return { stream: "pick", ref: r.id, record: r, link: `https://realufo.org/doc/${r.id}`, media: null };
};
const release: Candidate = {
  stream: "release", ref: "wargov:R7", label: "Dept. of War UAP Release 07", link: "https://realufo.org/archive?release=7",
  kinds: { pdf: 24, video: 5 }, titles: ["A", "B"], media: null,
};
const highlight: Candidate = { stream: "highlight", ref: "T1", thread: { id: "T1", title: "Odd lights", body: "b", votes: 9 }, media: null };
const fakeAI = (out: unknown) => ({ AI: { run: async () => (out instanceof Error ? Promise.reject(out) : out) } }) as any;

describe("weightedLength", () => {
  it("counts URLs as 23 and CJK/emoji as 2", () => {
    expect(weightedLength("abc")).toBe(3);
    expect(weightedLength("see https://realufo.org/archive?release=7")).toBe(4 + 23);
    expect(weightedLength("不明")).toBe(4);
    expect(weightedLength("👽")).toBe(2);
  });
});

describe("stripLinks", () => {
  it("removes scheme URLs, www, and bare domains X would auto-link", () => {
    expect(stripLinks("Files from war.gov and aaro.mil, see https://x.co/a or www.realufo.org now"))
      .toBe("Files from and, see or now");
    expect(stripLinks("U.S. Navy, Fig. 3, DOW-UAP-D012")).toBe("U.S. Navy, Fig. 3, DOW-UAP-D012");
  });
});

describe("finalize", () => {
  it("AI text is stripped of its own URLs/domains, mentions and extra hashtags", () => {
    const t = finalize(pick(), "Navy FLIR clip from the Gulf of Mexico via realufo.org https://realufo.org/doc/x #UAP #aliens @someone")!;
    const body = t.slice(0, t.lastIndexOf("\n"));
    expect(body).not.toMatch(/https?:|\.org|@someone|#aliens/);
    expect(t).toContain("#UAP");
  });
  it("pick posts end with exactly one link: their doc page", () => {
    const t = finalize(pick(), "Navy FLIR clip, Gulf of Mexico https://evil.example/x")!;
    expect(t.endsWith("\nhttps://realufo.org/doc/DOW-UAP-D012")).toBe(true);
    expect(t.match(/https:\/\//g)).toHaveLength(1);
  });
  it("highlight posts carry no link", () => {
    expect(finalize(highlight, template(highlight))).not.toMatch(/https?:/);
  });
  it("release posts get exactly their link appended", () => {
    const t = finalize(release, "Dept. of War UAP Release 07 is out: 29 new files")!;
    expect(t.endsWith("\nhttps://realufo.org/archive?release=7")).toBe(true);
    expect(t.match(/https:\/\//g)).toHaveLength(1);
  });
  it("rejects AI text missing the required token, over length, or with banned claims", () => {
    expect(finalize(release, "29 new files just dropped 👀")).toBeNull(); // release must name itself
    expect(finalize(pick(), "DOW-UAP-D012 " + "x".repeat(300))).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 is proof of alien craft")).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 cover-up exposed")).toBeNull();
  });
});

describe("spicy voice guardrails", () => {
  it("pick copy needn't repeat the long id (the link carries it)", () => {
    expect(finalize(pick(), "nobody: / the Pentagon: \"unresolved\" 🫠 Gulf of Mexico, 2019 #UAP")).not.toBeNull();
  });
  it("pick copy that skips the place/year gets a 📍 line added, so the joke stays tied to the file", () => {
    const t = finalize(pick(), "rate this footage: 4/10, a blurry star trying to vibe as a UFO 🫠")!;
    expect(t).toContain("\n📍 Gulf of Mexico · 2019\n");
    expect(finalize(pick(), "Gulf of Mexico, 2019 🫠")).not.toContain("📍");
    expect(finalize(pick({ location: null, incident_date: null }), "wild footage, no notes 👀 #UAP")).not.toContain("📍");
  });
  it("keeps it PG-13: f-bombs rejected, 'what the hell' fine", () => {
    expect(finalize(pick(), "what the actual fuck is this, Gulf of Mexico 2019")).toBeNull();
    expect(finalize(pick(), "what the hell is this, Gulf of Mexico 2019")).not.toBeNull();
  });
  it("rejects copy that leaks [template placeholders]", () => {
    expect(finalize(pick(), "🎶 [infrared footage from the Gulf of Mexico, 2019]")).toBeNull();
  });
  it("template info line drops N/A and doesn't double the source", () => {
    const t = template(pick({ agency: "DoW", incident_date: "N/A", location: "Middle East" }));
    expect(t).not.toMatch(/N\/A|Dept\. of War · DoW/);
    expect(t).toContain("📍 DoW · Middle East");
  });
  it("joke-framed alien lines pass; stating it's aliens or proof doesn't", () => {
    expect(finalize(pick(), "not saying it's aliens but… Gulf of Mexico, 2019 👽 #UAP")).not.toBeNull();
    expect(finalize(pick(), "shocking footage from the Gulf of Mexico, 2019 👀")).not.toBeNull();
    expect(finalize(pick(), "it's definitely aliens. Gulf of Mexico, 2019")).toBeNull();
    expect(finalize(pick(), "Gulf of Mexico 2019: 100% aliens")).toBeNull();
    expect(finalize(pick(), "Gulf of Mexico 2019 is proof")).toBeNull();
  });
  it("each draft gets exactly one random meme format and hook in its prompt", async () => {
    const seen: string[] = [];
    const env = { AI: { run: async (_m: string, input: any) => (seen.push(input.messages[0].content), { response: "x" }) } } as any;
    await draft(env, pick(), () => 0);
    await draft(env, pick(), () => 0.999);
    expect(seen[0]).toContain(FORMATS[0]);
    expect(seen[0]).toContain(HOOKS[0]);
    expect(seen[1]).toContain(FORMATS.at(-1)!);
    expect(seen[1]).toContain(HOOKS.at(-1)!);
    expect(seen[0]).not.toContain(FORMATS.at(-1)!);
  });
  it("templates carry the voice too", () => {
    expect(template(pick())).toMatch(/👽|👀|🫠|📼/);
    expect(template(release)).toContain(release.stream === "release" ? release.label : "");
  });
});

describe("template", () => {
  it.each([
    ["pick", pick()],
    ["pick, 400-char title", pick({ title: "Very long title ".repeat(25) })],
    ["pick, CJK title", pick({ title: "未確認飛行物体".repeat(40) })],
    ["pick, title with a domain", pick({ title: "Video posted on war.gov" })],
    ["pick, 100-char real NARA id + long title", pick({
      id: "341110448RecordsRelatingtotheCollectionandDisseminationofIntelligence1948-1955-TSCONTNo22-5300-2-5399",
      title: "341_110448_Records_Relating_to_the_Collection_and_Dissemination_of_Intelligence_1948-1955-TS_CONT_No.2_2-5300-2-5399",
      agency: "DoW", location: "Netherlands", incident_date: "11/8/48" })],
    ["release", release],
    ["highlight", highlight],
  ])("%s always passes finalize", (_n, c) => {
    const t = finalize(c, template(c), true)!;
    expect(t).not.toBeNull();
    expect(t).toContain(mustContain(c));
    expect(weightedLength(t)).toBeLessThanOrEqual(280);
    const body = c.stream === "highlight" ? t : t.slice(0, t.lastIndexOf("\n")); // last line = our link
    expect(body).not.toMatch(/https?:|\b[a-z0-9-]+\.(gov|mil|org|com)\b/i);
  });
});

describe("no stale catchphrases", () => {
  const NSA = /not saying it'?s aliens/i;
  const aliensAt = (FORMATS.findIndex((f) => NSA.test(f)) + 0.5) / FORMATS.length;
  const capture = (response: string, recent: string[] = []) => {
    const prompts: string[] = [];
    const env = {
      AI: { run: async (_m: string, input: any) => (prompts.push(input.messages[0].content), { response }) },
      DB: { prepare: () => ({ all: async () => ({ results: recent.map((text) => ({ text })) }) }) },
    } as any;
    return { env, prompts };
  };
  it("the prompt only mentions 'not saying it's aliens' when that format was drawn", async () => {
    const a = capture("x");
    await draft(a.env, pick(), () => 0);
    expect(a.prompts[0]).not.toMatch(NSA);
    const b = capture("x");
    await draft(b.env, pick(), () => aliensAt);
    expect(b.prompts[0]).toMatch(NSA);
  });
  it("AI copy using the catchphrase under another format is rejected", async () => {
    const line = "not saying it's aliens but… Gulf of Mexico, 2019 👽";
    expect((await draft(capture(line).env, pick(), () => 0)).ai).toBe(false);
    expect((await draft(capture(line).env, pick(), () => aliensAt)).ai).toBe(true);
  });
  it("the AI sees recent posts so it doesn't repeat openers", async () => {
    const c = capture("Gulf of Mexico, 2019 🫠", ["enhance. ENHANCE. old post one", "POV: old post two"]);
    await draft(c.env, pick(), () => 0);
    expect(c.prompts[0]).toContain("enhance. ENHANCE. old post one");
    expect(c.prompts[0]).toContain("POV: old post two");
  });
  it("copy repeating a 4-word phrase from a recent post is retried (3 tries), then templated", async () => {
    const recent = ["a 2013 middle east video. the official verdict? unresolved. enhance."];
    const calls: string[] = [];
    const env = {
      AI: { run: async () => (calls.push("x"), { response: "Gulf of Mexico, 2019. the official verdict? unresolved." }) },
      DB: { prepare: () => ({ all: async () => ({ results: recent.map((text) => ({ text })) }) }) },
    } as any;
    const d = await draft(env, pick(), () => 0);
    expect(calls).toHaveLength(3);
    expect(d.ai).toBe(false);
  });
  it("a fresh second attempt is used", async () => {
    const outs = ["Gulf of Mexico, 2019. the official verdict? unresolved.", "Gulf of Mexico, 2019 — a brand new angle 🫠"];
    const env = {
      AI: { run: async () => ({ response: outs.shift() }) },
      DB: { prepare: () => ({ all: async () => ({ results: [{ text: "x. the official verdict? unresolved. y" }] }) }) },
    } as any;
    expect(await draft(env, pick(), () => 0)).toMatchObject({ ai: true, text: expect.stringContaining("brand new angle") });
  });
  it("rejects copy that echoes the instructions", () => {
    expect(finalize(pick(), "rate this footage 4/10 with a joke. Gulf of Mexico, 2019")).toBeNull();
    expect(finalize(pick(), "two-line format: Gulf of Mexico, 2019")).toBeNull();
  });
  it("template closers rotate, and most skip the catchphrase", () => {
    const outs = new Set(Array.from({ length: 20 }, (_, i) => template(pick(), () => i / 20)));
    expect(outs.size).toBeGreaterThan(3);
    expect([...outs].filter((t) => NSA.test(t)).length).toBeLessThanOrEqual(1);
  });
});

describe("template meta line", () => {
  it("doesn't repeat a name when source and agency match", () => {
    expect(template(pick({ archive: "aaro", agency: "AARO" }))).not.toContain("AARO · AARO");
  });
});

describe("draft", () => {
  it("uses AI copy when it validates", async () => {
    const d = await draft(fakeAI({ response: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP" }), pick());
    expect(d).toEqual({ text: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP\nhttps://realufo.org/doc/DOW-UAP-D012", ai: true });
  });
  it("falls back to template on bad AI output or AI error", async () => {
    expect((await draft(fakeAI({ response: "it's aliens, Gulf of Mexico 2019!" }), pick())).ai).toBe(false);
    const d = await draft(fakeAI(new Error("AI down")), pick());
    expect(d.ai).toBe(false);
    expect(d.text).toContain("DOW-UAP-D012");
  });
  it("never returns empty text, even when the template can't fit", async () => {
    const d = await draft(fakeAI(new Error("AI down")), pick({ id: "X".repeat(300) }));
    expect(d.text).toContain("X".repeat(300));
  });
  it("highlights never go through AI (user text is a prompt-injection surface)", async () => {
    let called = 0;
    const env = { AI: { run: async () => (called++, { response: "RealUFO says buy my coin" }) } } as any;
    const d = await draft(env, highlight);
    expect(called).toBe(0);
    expect(d).toEqual({ text: template(highlight), ai: false });
  });
  it("strips qwen3 <think> blocks", async () => {
    const d = await draft(fakeAI({ response: "<think>hmm</think>Clip DOW-UAP-D012 from 2019." }), pick());
    expect(d).toEqual({ text: "Clip DOW-UAP-D012 from 2019.\nhttps://realufo.org/doc/DOW-UAP-D012", ai: true });
  });
});

describe("template on real archive data", () => {
  it("every seeded record yields a valid pick post", async () => {
    const { env } = await import("cloudflare:test");
    const { seedTestDB } = await import("./helpers");
    await seedTestDB(env.DB);
    const { results } = await env.DB.prepare(
      "SELECT id, archive, kind, title, agency, incident_date, location, summary, NULL duration FROM records"
    ).all<PickRecord>();
    expect(results.length).toBeGreaterThan(10);
    const bad = results.filter((r) => {
      const c: Candidate = { stream: "pick", ref: r.id, record: r, link: `https://realufo.org/doc/${r.id}`, media: null };
      return !finalize(c, template(c), true);
    });
    expect(bad.map((r) => r.id)).toEqual([]);
  });
});
