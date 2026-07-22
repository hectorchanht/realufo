import { describe, it, expect } from "vitest";
import { actorId, newId, newNo } from "../lib/anon";
describe("anon", () => {
  it("hashes the X-Anon-Id header deterministically", async () => {
    const req = new Request("https://x", { headers: { "X-Anon-Id": "abc" } });
    const a = await actorId(req, "salt"); const b = await actorId(req, "salt");
    expect(a).toBe(b); expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it("differs by salt and returns sentinel when header missing", async () => {
    const req = new Request("https://x", { headers: { "X-Anon-Id": "abc" } });
    expect(await actorId(req, "s1")).not.toBe(await actorId(req, "s2"));
    expect(await actorId(new Request("https://x"), "s")).toBe("anon:none");
  });
  it("newId is 8 uppercase hex, newNo is a large int", () => {
    expect(newId()).toMatch(/^[0-9A-F]{8}$/);
    expect(newNo()).toBeGreaterThan(24000000);
  });
});
