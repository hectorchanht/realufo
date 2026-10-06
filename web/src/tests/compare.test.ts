// Compare screen: diff-flag logic (pure, no DOM).
import { describe, it, expect } from "vitest";
import { diffFlags } from "../screens/Compare";

const r = (label: string, value: string | null) => ({ label, value });

describe("diffFlags", () => {
  it("flags only the rows whose values differ", () => {
    const a = [r("Title", "Same"), r("Agency", "CIA"), r("Kind", "pdf")];
    const b = [r("Title", "Same"), r("Agency", "FBI"), r("Kind", "pdf")];
    expect(diffFlags(a, b)).toEqual([false, true, false]);
  });
  it("treats null vs missing value as a difference", () => {
    expect(diffFlags([r("Location", null)], [r("Location", "Nevada")])).toEqual([true]);
    expect(diffFlags([r("Location", null)], [r("Location", null)])).toEqual([false]);
  });
  it("ignores rows with no counterpart (shorter B)", () => {
    expect(diffFlags([r("A", "x"), r("B", "y")], [r("A", "x")])).toEqual([false, false]);
  });
});
