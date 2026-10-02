import { describe, it, expect } from "vitest";
import { weightedLength, stripLinks, finalize, template, draft, mustContain } from "../lib/xcopy";
import type { Candidate, PickRecord } from "../lib/xpick";

const record = (over: Partial<PickRecord> = {}): PickRecord => ({
  id: "DOW-UAP-D012", archive: "wargov", kind: "video", title: "Object over Gulf", agency: "Navy",
  incident_date: "2019", location: "Gulf of Mexico", summary: "FLIR footage.", duration: 42, ...over,
});
const pick = (over: Partial<PickRecord> = {}): Candidate => ({ stream: "pick", ref: "DOW-UAP-D012", record: record(over), media: null });
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
  it("no-link streams never contain a URL or domain", () => {
    const t = finalize(pick(), "Navy FLIR clip DOW-UAP-D012 from realufo.org https://realufo.org/doc/x #UAP #aliens @someone")!;
    expect(t).not.toMatch(/https?:|\.org|@someone|#aliens/);
    expect(t).toContain("#UAP");
  });
  it("release posts get exactly their link appended", () => {
    const t = finalize(release, "Dept. of War UAP Release 07 is out: 29 new files")!;
    expect(t.endsWith("\nhttps://realufo.org/archive?release=7")).toBe(true);
    expect(t.match(/https:\/\//g)).toHaveLength(1);
  });
  it("rejects AI text missing the required token, over length, or with banned claims", () => {
    expect(finalize(pick(), "A cool video")).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 " + "x".repeat(300))).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 is proof of alien craft")).toBeNull();
    expect(finalize(pick(), "DOW-UAP-D012 cover-up exposed")).toBeNull();
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
    if (c.stream !== "release") expect(t).not.toMatch(/https?:|\b[a-z0-9-]+\.(gov|mil|org|com)\b/i);
  });
});

describe("draft", () => {
  it("uses AI copy when it validates", async () => {
    const d = await draft(fakeAI({ response: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP" }), pick());
    expect(d).toEqual({ text: "Navy FLIR clip DOW-UAP-D012, Gulf of Mexico, 2019. #UAP", ai: true });
  });
  it("falls back to template on bad AI output or AI error", async () => {
    expect((await draft(fakeAI({ response: "aliens!" }), pick())).ai).toBe(false);
    const d = await draft(fakeAI(new Error("AI down")), pick());
    expect(d.ai).toBe(false);
    expect(d.text).toContain("DOW-UAP-D012");
  });
  it("never returns empty text, even when the template can't fit", async () => {
    const d = await draft(fakeAI(new Error("AI down")), pick({ id: "X".repeat(300) }));
    expect(d.text).toContain("X".repeat(300));
  });
  it("strips qwen3 <think> blocks", async () => {
    const d = await draft(fakeAI({ response: "<think>hmm</think>Clip DOW-UAP-D012 from 2019." }), pick());
    expect(d).toEqual({ text: "Clip DOW-UAP-D012 from 2019.", ai: true });
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
      const c: Candidate = { stream: "pick", ref: r.id, record: r, media: null };
      return !finalize(c, template(c), true);
    });
    expect(bad.map((r) => r.id)).toEqual([]);
  });
});
