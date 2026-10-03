import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { storyView } from "../routes/cases";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";

const S = CASE_STORY_TEXT.socorro;
const firstId = S.sources.find((s) => s.id)!.id!;
beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)")
    .bind(firstId, "nara", "NARA", `${firstId}, Socorro source`, "x", "pdf", "live").run();
});
const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://cases.test" + path), env as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("case story view", () => {
  it("resolves archive sources to doc links, outside to urls, missing records to plain text", async () => {
    const v = (await storyView(env as any, "socorro"))!;
    expect(v.title).toBe(S.title);
    const first = v.sources[S.sources.findIndex((s) => s.id === firstId)];
    const page = S.sources.find((s) => s.id === firstId)!.page;
    expect(first.href).toBe(`/doc/${encodeURIComponent(firstId)}${page ? `?p=${page}` : ""}`);
    expect(first.label).toContain("Socorro source");
    const ext = v.sources.find((s) => s.external);
    if (ext) expect(ext.href).toMatch(/^https:\/\//);
    const gone = v.sources.find((s, i) => S.sources[i].id && S.sources[i].id !== firstId);
    if (gone) { expect(gone.href).toBeNull(); expect(gone.label).toMatch(/no longer available/); }
    expect(await storyView(env as any, "nope")).toBeNull();
  });

  it("GET /api/cases/socorro includes the story", async () => {
    const d: any = await (await call("/api/cases/socorro")).json();
    expect(d.story.title).toBe(S.title);
    expect(d.story.sources.length).toBe(S.sources.length);
  });

  it("doc pages list the stories that cite them", async () => {
    const d: any = await (await call(`/api/records/${encodeURIComponent(firstId)}`)).json();
    expect(d.citedIn).toEqual([{ slug: "socorro", title: S.title }]);
  });

  it("apex /stories/<moved slug> goes straight to /case; others to the subdomain", async () => {
    const moved = await call("/stories/socorro/");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("https://cases.test/case/socorro");
    const other = await call("/stories/tic-tac/");
    expect(other.headers.get("location")).toBe("https://release.realufo.org/stories/tic-tac/");
  });

  it("inherited object keys are not stories (no bogus redirect, no story view)", async () => {
    const res = await call("/stories/constructor");
    expect(res.headers.get("location")).toBe("https://release.realufo.org/stories/constructor/");
    expect(await storyView(env as any, "constructor")).toBeNull();
    expect(await storyView(env as any, "toString")).toBeNull();
  });

  it("sitemap case entries carry lastmod from the story", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    expect(xml).toContain(`<loc>https://cases.test/case/socorro</loc><lastmod>${S.updated}</lastmod>`);
  });
});
