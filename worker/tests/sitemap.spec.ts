import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

beforeAll(() => seedTestDB(env.DB));

describe("sitemap", () => {
  it("lists static, doc, thread, board and case URLs as XML", async () => {
    const res = await worker.fetch(new Request("https://realufo.org/sitemap.xml"), env as any, {} as any);
    expect(res.headers.get("content-type")).toMatch(/xml/);
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml/);
    expect(xml).toContain("<loc>https://realufo.org/archive</loc>");
    expect(xml).toMatch(/<loc>https:\/\/realufo\.org\/doc\/[^<]+<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
    expect(xml).toContain("/thread/");
    expect(xml).toContain("/board/");
    expect(xml).toContain("/case/");
  });
});
