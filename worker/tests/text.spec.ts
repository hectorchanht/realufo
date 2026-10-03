import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";

const get = (p: string) => worker.fetch(new Request("https://x" + p), env as any, {} as any);
const OCR = [
  { n: 1, text: "APOLLO 11\nCREW DEBRIEFING", src: "ocr", conf: 0.93 },
  { n: 2, text: "", src: "ocr", conf: 0 },
  { n: 3, text: "ALDRIN Yes, and we weren't sure", src: "pdf" },
];

beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO records(id,title,kind,status) VALUES('TX-OCR','Apollo 11 Debriefing','pdf','live')"),
    env.DB.prepare("INSERT INTO records(id,title,kind,status) VALUES('TX D1 1.pdf','Capped file','pdf','live')"),
    env.DB.prepare("INSERT INTO records(id,title,kind,status) VALUES('TX-VID','A video','video','live')"),
    env.DB.prepare("INSERT INTO record_ocr(record_id,pages,ocr_pages,chars,engine) VALUES('TX-OCR',3,2,60,'t')"),
    env.DB.prepare("INSERT INTO record_text(record_id,pages,truncated,total_pages) VALUES('TX D1 1.pdf',?,1,9)")
      .bind(JSON.stringify([{ n: 4, text: "Page four" }])),
  ]);
  await env.MEDIA.put("text/TX-OCR.json", JSON.stringify(OCR));
});

describe("GET /doc/:id/text", () => {
  it("defaults to Markdown with one heading and ?p=N link per page", async () => {
    const res = await get("/doc/TX-OCR/text");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const md = await res.text();
    expect(md).toContain("# Apollo 11 Debriefing (TX-OCR)");
    expect(md).toContain("- Pages: 3 (2 OCR, may contain errors)");
    expect(md).toContain("## Page 1\n\n[p.1](https://x/doc/TX-OCR?p=1)\n\nAPOLLO 11\nCREW DEBRIEFING");
    expect(md).toContain("## Page 2\n\n[p.2](https://x/doc/TX-OCR?p=2)\n\n(no text on this page)");
    expect(md).toContain("## Page 3");
  });

  it("?format=json returns id, title, url and every page", async () => {
    const res = await get("/doc/TX-OCR/text?format=json");
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ id: "TX-OCR", title: "Apollo 11 Debriefing", url: "https://x/doc/TX-OCR", pages: OCR });
  });

  it("the API path serves the same JSON", async () => {
    const res = await get("/api/records/TX-OCR/text?format=json");
    expect(((await res.json()) as any).pages).toHaveLength(3);
  });

  it("falls back to the capped D1 pages, flagged truncated, for ids with spaces", async () => {
    const md = await (await get("/doc/TX%20D1%201.pdf/text")).text();
    expect(md).toContain("## Page 4\n\n[p.4](https://x/doc/TX%20D1%201.pdf?p=4)\n\nPage four");
    expect(md).toContain("(Text continues in the original file: 9 pages.)");
    const j: any = await (await get("/doc/TX%20D1%201.pdf/text?format=json")).json();
    expect(j).toMatchObject({ truncated: true, total_pages: 9, pages: [{ n: 4, text: "Page four" }] });
  });

  it("404s for files without text and unknown ids", async () => {
    expect((await get("/doc/TX-VID/text")).status).toBe(404);
    expect((await get("/doc/NOPE/text")).status).toBe(404);
  });
});
