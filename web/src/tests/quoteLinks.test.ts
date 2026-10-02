import { describe, expect, it } from "vitest";
import { backlinks, quotedNos } from "../lib/quoteLinks";

describe("quoteLinks", () => {
  it("quotedNos dedupes in order", () => {
    expect(quotedNos(">>123456 yes >>123456 and >>777777")).toEqual([123456, 777777]);
  });

  it("backlinks maps quoted No to later quoters, ignoring unknown and self quotes", () => {
    const m = backlinks([
      { no: 1000, body: "op" },
      { no: 2000, body: ">>1000 agree >>2000" },
      { no: 3000, body: ">>1000 >>2000 >>9999" },
    ]);
    expect(m.get(1000)).toEqual([2000, 3000]);
    expect(m.get(2000)).toEqual([3000]);
    expect(m.has(9999)).toBe(false);
    expect(m.size).toBe(2);
  });
});
