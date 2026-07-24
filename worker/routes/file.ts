import type { Env } from "../env";
import { error } from "../lib/json";

// Serve a record's file SAME-ORIGIN with `Content-Disposition: inline`, streamed
// from R2 via the MEDIA binding. The R2 custom domain (assets.realufo.org) makes
// mobile browsers *download* cross-origin PDFs; serving through the Worker on
// realufo.org with an inline disposition makes them render in the browser's own
// PDF viewer instead.
export async function viewFile(req: Request, env: Env, p: Record<string, string>) {
  const asset = await env.DB.prepare("SELECT cdn_url, mime FROM assets WHERE record_id=? AND role='full' LIMIT 1")
    .bind(p.id)
    .first<{ cdn_url: string; mime: string | null }>();
  if (!asset?.cdn_url) return error(404, "no file");

  let key: string;
  try {
    key = decodeURIComponent(new URL(asset.cdn_url).pathname).replace(/^\/+/, "");
  } catch {
    return error(400, "bad asset url");
  }

  // Range support (mobile PDF viewers / video seeking request byte ranges).
  const range = req.headers.get("range");
  const obj = range
    ? await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers })
    : await env.MEDIA.get(key);
  if (!obj) return error(404, "file not found");

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("content-type", asset.mime || obj.httpMetadata?.contentType || "application/octet-stream");
  headers.set("content-disposition", "inline");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");

  const objAny = obj as R2ObjectBody & { range?: { offset?: number; length?: number } };
  if (range && objAny.range && "body" in obj) {
    const size = obj.size;
    const offset = objAny.range.offset ?? 0;
    const length = objAny.range.length ?? size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${size}`);
    headers.set("content-length", String(length));
    return new Response((obj as R2ObjectBody).body, { status: 206, headers });
  }
  if (!("body" in obj)) return error(404, "file not found");
  return new Response((obj as R2ObjectBody).body, { headers });
}
