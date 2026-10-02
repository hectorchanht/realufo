import { describe, it, expect } from "vitest";
import { cachedJson } from "../lib/cache";

describe("cachedJson", () => {
  it("memoises a value per key", async () => {
    let calls = 0;
    const load = async () => ({ n: ++calls });
    expect(await cachedJson("https://x/__t/a", load)).toEqual({ n: 1 });
    expect(await cachedJson("https://x/__t/a", load)).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });
  it("never stores null", async () => {
    let calls = 0;
    const none = async () => (calls++, null);
    expect(await cachedJson("https://x/__t/b", none)).toBeNull();
    await cachedJson("https://x/__t/b", none);
    expect(calls).toBe(2);
  });
});
