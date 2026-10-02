import { describe, it, expect } from "vitest";
import { scrollKey } from "../lib/useScrollMemory";

describe("scrollKey", () => {
  it("ignores media-tool params", () => {
    expect(scrollKey("/doc/X", "?br=120&lens=1&mag=4")).toBe(scrollKey("/doc/X", ""));
    expect(scrollKey("/doc/X", "")).toBe("/doc/X");
  });
  it("keeps list filters distinct", () => {
    expect(scrollKey("/archive", "?type=video&page=2")).toBe("/archive?type=video&page=2");
  });
  it("drops only the tool params from a mixed query", () => {
    expect(scrollKey("/doc/X", "?q=roswell&ct=140")).toBe("/doc/X?q=roswell");
  });
});
