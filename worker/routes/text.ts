import type { Env } from "../env";
import { json, error } from "../lib/json";

// A file's full text, every page (spec 2026-10-03-realufo-paddleocr-reocr): Markdown by
// default, ?format=json for data. Re-OCR'd files (record_ocr row) read R2 text/<id>.json,
// written by crawler ingest.ocr; anything else falls back to the capped D1 record_text.
// Served at /doc/<id>/text and /api/records/<id>/text.
type Page = { n: number; text: string; src?: string; conf?: number };

const CACHE = "public, max-age=86400";

export async function recordText(req: Request, env: Env, p: Record<string, string>) {
  const rec = await env.DB.prepare(
    `SELECT r.title, EXISTS(SELECT 1 FROM record_ocr o WHERE o.record_id=r.id) AS ocr,
       t.pages, t.truncated, t.total_pages
     FROM records r LEFT JOIN record_text t ON t.record_id=r.id WHERE r.id=? AND r.status='live'`,
  ).bind(p.id).first<{ title: string | null; ocr: number; pages: string | null; truncated: number | null; total_pages: number | null }>();
  if (!rec) return error(404, "not found");

  let pages: Page[] = [];
  let truncated = false;
  let total = 0;
  const obj = rec.ocr ? await env.MEDIA.get(`text/${p.id}.json`) : null;
  if (obj) {
    pages = await obj.json<Page[]>();
    total = pages.length;
  } else if (rec.pages) {
    pages = JSON.parse(rec.pages) as Page[];
    truncated = !!rec.truncated;
    total = rec.total_pages ?? pages.length;
  }
  if (!pages.length) return error(404, "no full text");

  const origin = new URL(req.url).origin;
  const docUrl = `${origin}/doc/${encodeURIComponent(p.id)}`;
  const title = rec.title || p.id;
  if (new URL(req.url).searchParams.get("format") === "json") {
    return json(
      { id: p.id, title, url: docUrl, pages, ...(truncated ? { truncated, total_pages: total } : {}) },
      { headers: { "cache-control": CACHE } },
    );
  }
  const ocrPages = pages.filter((x) => x.src === "ocr").length;
  const md = [
    `# ${title} (${p.id})`, "",
    `- Page: ${docUrl}`,
    `- Original file: ${origin}/api/file/${encodeURIComponent(p.id)}`,
    `- Pages: ${total}${ocrPages ? ` (${ocrPages} OCR, may contain errors)` : ""}`,
    `- JSON: ${docUrl}/text?format=json`, "",
    ...pages.flatMap((x) => [`## Page ${x.n}`, "", `[p.${x.n}](${docUrl}?p=${x.n})`, "", x.text.trim() || "(no text on this page)", ""]),
    ...(truncated ? [`(Text continues in the original file: ${total} pages.)`, ""] : []),
  ].join("\n");
  return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": CACHE } });
}
