import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportIdentity, importIdentity } from "../lib/identity";

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
});
