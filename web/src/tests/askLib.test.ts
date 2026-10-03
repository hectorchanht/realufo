import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ASK_HISTORY_KEY, addAskHistory, clearAskHistory, readAskHistory } from "../lib/askHistory";
import { askComposerOpts, askThreadBody } from "../lib/askThread";

// In-memory Storage so these tests don't depend on the runner's localStorage.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("askHistory", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it("adds newest first, dedupes case-insensitively, caps at 20, clears", () => {
    addAskHistory("first question");
    addAskHistory("Second question");
    expect(addAskHistory("FIRST question")).toEqual(["FIRST question", "Second question"]);
    for (let i = 0; i < 25; i++) addAskHistory(`q${i}`);
    const list = readAskHistory();
    expect(list).toHaveLength(20);
    expect(list[0]).toBe("q24");
    clearAskHistory();
    expect(readAskHistory()).toEqual([]);
  });

  it("corrupted or non-array storage reads as empty", () => {
    localStorage.setItem(ASK_HISTORY_KEY, "{not json");
    expect(readAskHistory()).toEqual([]);
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify({ a: 1 }));
    expect(readAskHistory()).toEqual([]);
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["ok", 3, null]));
    expect(readAskHistory()).toEqual(["ok"]);
  });

  it("storage that throws reads as empty and writes are no-ops", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom, clear: boom });
    expect(readAskHistory()).toEqual([]);
    expect(() => addAskHistory("q")).not.toThrow();
    expect(() => clearAskHistory()).not.toThrow();
  });
});

const data = {
  answer: "Radar tracked it [1] and pilots saw it [2], see also [9].",
  sources: [
    { n: 1, record_id: "CIA-UAP-017", title: "High Alert", page: 2, kind: "pdf" as const, thumb: null },
    { n: 2, record_id: "CIA-UAP-017", title: "High Alert", page: 4, kind: "pdf" as const, thumb: null },
  ],
};

describe("askThread", () => {
  it("builds the thread body: [n] markers kept, unknown citations dropped, one doc URL per source", () => {
    expect(askThreadBody("What did radar see?", data)).toBe(
      "Q: What did radar see?\n\n" +
        "Radar tracked it [1] and pilots saw it [2], see also.\n\n" +
        "Sources:\n" +
        "[1] https://realufo.org/doc/CIA-UAP-017\n" +
        "[2] https://realufo.org/doc/CIA-UAP-017\n\n" +
        "\u2014 via Ask the Archive",
    );
  });

  it("encodes ids with odd characters in the doc URL", () => {
    const odd = { answer: "x [1]", sources: [{ ...data.sources[0], record_id: "AARO-Case_Resolution_of _Western" }] };
    expect(askThreadBody("q", odd)).toContain("https://realufo.org/doc/AARO-Case_Resolution_of%20_Western");
  });

  it("Composer opts: new thread on uap, title cut to 120, first source referenced", () => {
    const long = "x".repeat(300);
    const o = askComposerOpts(long, data);
    expect(o).toMatchObject({ mode: "newThread", boardId: "uap", sourceRecordId: "CIA-UAP-017", refLabel: "High Alert" });
    expect(o.presetTitle).toHaveLength(120);
    expect(o.presetBody!.startsWith(`Q: ${long}\n`)).toBe(true);
  });
});

describe("Ask tab re-tap", () => {
  it("tapping Ask while on an answer goes back to the lists; switching back from another tab keeps the answer", async () => {
    const { MORE_ITEMS, rememberTabUrl, tabHref } = await import("../components/navItems");
    const ask = MORE_ITEMS.find((i) => i.tab === "ask")!;
    rememberTabUrl("/ask", "?q=roswell");
    expect(tabHref(ask, "ask")).toBe("/ask");
    expect(tabHref(ask, "feed")).toBe("/ask?q=roswell");
  });
});
