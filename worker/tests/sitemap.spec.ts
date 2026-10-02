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
    expect(xml).toContain("/board/uap</loc>");
    expect(xml).not.toContain("%2F");
    expect(xml).toContain("/case/");
  });

  it("video docs carry video:video tags (thumbnail, title, content, date)", async () => {
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime) VALUES('AARO-956955','thumb','https://cdn/t.jpg','image/jpeg')").run();
    const xml = await (await worker.fetch(new Request("https://realufo.org/sitemap.xml"), env as any, {} as any)).text();
    const v = xml.match(/<url><loc>https:\/\/realufo\.org\/doc\/AARO-956955<\/loc>.*?<\/url>/)![0];
    expect(v).toMatch(/<video:thumbnail_loc>https:[^<]+<\/video:thumbnail_loc>/);
    expect(v).toContain("<video:title>AARO-956955 — ");
    expect(v).toMatch(/<video:content_loc>https:[^<]+\.mp4<\/video:content_loc>/);
    expect(v).toContain("<video:publication_date>2024</video:publication_date>");
  });

  it("llms.txt is Markdown: title, summary with counts, main pages and hub links", async () => {
    const res = await worker.fetch(new Request("https://realufo.org/llms.txt"), env as any, {} as any);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const md = await res.text();
    expect(md).toMatch(/^# RealUFO\n\n> Searchable archive of \d+ declassified/);
    expect(md).toContain("- [Archive](https://realufo.org/archive)");
    expect(md).toContain("## Agencies");
    expect(md).toContain("- [FBI UAP files](https://realufo.org/agency/fbi): ");
  });

  it("llms-full.txt streams every file with facts, summaries and page text", async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages,ai_summary) VALUES('CIA-UAP-017','[{"n":1,"text":"Harare tower log"}]',1,9,'AI says hi')`
    ).run();
    const res = await worker.fetch(new Request("https://realufo.org/llms-full.txt"), env as any, {} as any);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const md = await res.text();
    expect(md).toMatch(/^# RealUFO\n/);
    expect(md).toContain("## CIA-UAP-017 — Placement on High Alert");
    expect(md).toContain("- Page: https://realufo.org/doc/CIA-UAP-017");
    expect(md).toContain("### AI summary\n\nAI says hi");
    expect(md).toContain("#### Page 1\n\nHarare tower log");
    expect(md).toContain("(Text continues in the original file: 9 pages.)");
    const ids = [...md.matchAll(/^## (.+?) — /gm)].map((m) => m[1]);
    const { n } = (await env.DB.prepare("SELECT count(*) n FROM records WHERE status='live'").first<{ n: number }>())!;
    expect(ids.length).toBe(n); // every batch made it
  });
});
