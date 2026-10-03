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
    expect(xml).toContain("<loc>https://realufo.org/releases</loc>");
    expect(xml).toMatch(/<loc>https:\/\/realufo\.org\/doc\/[^<]+<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/);
    expect(xml).toContain("/thread/");
    expect(xml).toContain("/board/uap</loc>");
    expect(xml).not.toContain("%2F");
    expect(xml).toContain("/case/");
    expect(xml).toContain("/cases</loc>");
  });

  it("lists topic hubs once they have enough files", async () => {
    const ins = env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)");
    await env.DB.batch([1, 2, 3, 4, 5].map((n) => ins.bind(`SM-${n}`, "wargov", "DoW", `SM-${n}, AAWSAP DIRD, Sitemap test ${n}`, "x", "pdf", "live")));
    // Fresh origin: the hub list memo for realufo.org was filled before the inserts.
    const res = await worker.fetch(new Request("https://topicsitemap.test/sitemap.xml"), env as any, {} as any);
    expect(await res.text()).toContain("<loc>https://topicsitemap.test/topic/aawsap</loc>");
  });

  it("rss.xml lists newest live files as RSS 2.0 items linking to doc pages", async () => {
    const res = await worker.fetch(new Request("https://realufo.org/rss.xml"), env as any, {} as any);
    expect(res.headers.get("content-type")).toMatch(/rss\+xml/);
    const xml = await res.text();
    expect(xml).toMatch(/^<\?xml[^>]*><rss version="2.0"/);
    expect(xml).toMatch(/<item><title>[^<]+<\/title><link>https:\/\/realufo\.org\/doc\/[^<]+<\/link><guid isPermaLink="true">/);
    expect(xml).toMatch(/<pubDate>\w{3}, \d\d \w{3} \d{4}/);
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
    expect(md).toContain("`/doc/<file id>/text` serves its full text page by page as Markdown");
  });

  it("llms-full.txt streams every file with facts, summaries and page text", async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO record_text(record_id,pages,truncated,total_pages,ai_summary) VALUES('CIA-UAP-017','[{"n":1,"text":"Harare tower log"}]',1,9,'AI says hi')`
    ).run();
    await env.DB.prepare("INSERT INTO record_tldr (record_id,lang,bullets,one_liner,input_hash) VALUES ('CIA-UAP-017','en',?,'Paperwork wins again.','h')")
      .bind(JSON.stringify(["Bullet one", "Bullet two", "Bullet three"])).run();
    const res = await worker.fetch(new Request("https://realufo.org/llms-full.txt"), env as any, {} as any);
    expect(res.headers.get("content-type")).toMatch(/text\/markdown/);
    const md = await res.text();
    expect(md).toMatch(/^# RealUFO\n/);
    expect(md).toContain("## CIA-UAP-017 — Placement on High Alert");
    expect(md).toContain("- Page: https://realufo.org/doc/CIA-UAP-017");
    expect(md).toContain("### TL;DR\n\nPaperwork wins again.\n\n- Bullet one\n- Bullet two\n- Bullet three\n");
    expect(md).toContain("### AI summary\n\nAI says hi");
    expect(md).toContain("#### Page 1\n\nHarare tower log");
    expect(md).toContain("(Text continues in the original file: 9 pages.)");
    const ids = [...md.matchAll(/^- Page: /gm)];
    const { n } = (await env.DB.prepare("SELECT count(*) n FROM records WHERE status='live'").first<{ n: number }>())!;
    expect(ids.length).toBe(n); // every batch made it
  });

  it("lists one URL per distinct shared question (earliest row), skipping private and unanswered rows", async () => {
    const a = JSON.stringify({ answer: "x [1]", sources: [] });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer,created_at) VALUES(9201,'Gimbal video?','a',1,?,'2026-09-30 10:00:00')").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer) VALUES(9202,'gimbal video?','a',1,?)").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public,answer) VALUES(9203,'Private one','a',0,?)").bind(a),
      env.DB.prepare("INSERT INTO ask_log(id,question,actor_id,public) VALUES(9204,'Old shared one','a',1)"),
    ]);
    const xml = await (await worker.fetch(new Request("https://realufo.org/sitemap.xml"), { ...env, FEATURE_ASK: "off" } as any, {} as any)).text();
    expect(xml).toContain("<url><loc>https://realufo.org/ask/9201-gimbal-video</loc><lastmod>2026-09-30</lastmod></url>");
    expect(xml).not.toContain("/ask/9202");
    expect(xml).not.toContain("/ask/9203");
    expect(xml).not.toContain("/ask/9204");
  });
});
