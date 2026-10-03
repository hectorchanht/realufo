import { beforeEach, describe, expect, it, vi } from "vitest";
import { carryOverFollows, exportIdentity, importIdentity } from "../lib/identity";

const ID = "3f2c8a1e-9b4d-4c2a-8e7f-1a2b3c4d5e6f";

describe("identity export/import", () => {
  beforeEach(() => {
    const m = new Map<string, string>(); // in-memory Storage, as in askLib.test.ts
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, String(v)),
      removeItem: (k: string) => void m.delete(k),
      clear: () => m.clear(),
    });
  });

  it("round-trips, replaces listed keys, ignores unknown ones", () => {
    localStorage.setItem("ufo_anon", ID);
    localStorage.setItem("ufo_theme", "dark");
    const file = exportIdentity();

    localStorage.clear();
    localStorage.setItem("ufo_anon", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    localStorage.setItem("realufo.askHistory", '["old"]'); // not in file → removed
    const f = JSON.parse(file);
    f.data.evil = "x";
    expect(importIdentity(JSON.stringify(f))).toBe(true);

    expect(localStorage.getItem("ufo_anon")).toBe(ID);
    expect(localStorage.getItem("ufo_theme")).toBe("dark");
    expect(localStorage.getItem("realufo.askHistory")).toBeNull();
    expect(localStorage.getItem("evil")).toBeNull();
  });

  it("rejects bad files without touching storage", () => {
    localStorage.setItem("ufo_anon", ID);
    for (const bad of [
      "not json",
      JSON.stringify({ app: "other", v: 1, data: { ufo_anon: ID } }),
      JSON.stringify({ app: "realufo", v: 2, data: { ufo_anon: ID } }),
      JSON.stringify({ app: "realufo", v: 1, data: { ufo_anon: "not-a-uuid" } }),
      JSON.stringify({ app: "realufo", v: 1 }),
    ])
      expect(importIdentity(bad)).toBe(false);
    expect(localStorage.getItem("ufo_anon")).toBe(ID);
  });

  it("import remembers the previous id once (not when it's the same id)", () => {
    const OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    localStorage.setItem("ufo_anon", ID);
    const file = exportIdentity();
    importIdentity(file);
    expect(localStorage.getItem("ufo_anon_prev")).toBeNull();
    localStorage.setItem("ufo_anon", OLD);
    importIdentity(file);
    expect(localStorage.getItem("ufo_anon_prev")).toBe(OLD);
  });

  describe("carryOverFollows", () => {
    const OLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    beforeEach(() => {
      vi.restoreAllMocks();
      localStorage.setItem("ufo_anon", ID);
      localStorage.setItem("ufo_anon_prev", OLD);
      localStorage.setItem("pushSync", "2026-10-03");
    });

    it("sends the previous id with the new one, then forgets it and forces a push resync", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
      await carryOverFollows();
      const [url, init] = spy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/follows/merge");
      expect(JSON.parse(String(init.body))).toEqual({ from: OLD });
      expect((init.headers as Record<string, string>)["X-Anon-Id"]).toBe(ID);
      expect(localStorage.getItem("ufo_anon_prev")).toBeNull();
      expect(localStorage.getItem("pushSync")).toBeNull();
    });

    it("keeps it for the next start when offline or rate-limited", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
      await carryOverFollows();
      expect(localStorage.getItem("ufo_anon_prev")).toBe(OLD);
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 429 }));
      await carryOverFollows();
      expect(localStorage.getItem("ufo_anon_prev")).toBe(OLD);
    });

    it("drops it when the server rejects it (no endless retries)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"error":"bad from"}', { status: 400 }));
      await carryOverFollows();
      expect(localStorage.getItem("ufo_anon_prev")).toBeNull();
    });

    it("does nothing without a previous id", async () => {
      localStorage.removeItem("ufo_anon_prev");
      const spy = vi.spyOn(globalThis, "fetch");
      await carryOverFollows();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
