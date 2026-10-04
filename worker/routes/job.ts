// worker/routes/job.ts
import type { Env } from "../env";
import { error, json } from "../lib/json";
import { sameSecret } from "../lib/secret";
import { createJob } from "../lib/jobs";
import { preview } from "../lib/gate";

// The owner's ✅ runs payload.sql as-is, so a leaked ADMIN_TOKEN must not become arbitrary D1 writes:
// only scripts/article.py's tables, one statement per item (D1 runs every statement in a string, so a
// ';' — or a comment / quoted identifier that could hide one — outside '…' literals is refused).
const WRITE = /^\s*(INSERT INTO|UPDATE|DELETE FROM)\s+(articles|article_records|threads|posts)\b/i;
const okSql = (s: unknown) => typeof s === "string" && WRITE.test(s) && !/[;"`[]|--|\/\*/.test(s.replace(/'(?:[^']|'')*'/g, ""));
const okUrl = (u: unknown) => typeof u === "string" && u.startsWith("https://realufo.org/");

// POST /__job (Bearer ADMIN_TOKEN): operator jobs from scripts (article.py). The owner's ✅ in
// Telegram runs the payload (worker/lib/gate.ts approve). Unset ADMIN_TOKEN = 404.
export async function jobRoute(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.ADMIN_TOKEN || req.method !== "POST" || !(await sameSecret(auth, `Bearer ${env.ADMIN_TOKEN}`))) return error(404, "not found");
  const b = await req.json<any>().catch(() => null);
  const p = b?.payload, sc = p?.showcase;
  if (!b || b.kind !== "article" || typeof b.ref !== "string" || !Array.isArray(p?.sql) || !Array.isArray(p?.urls))
    return error(400, "need {kind:'article', ref, caption, media, payload:{sql[], urls[], showcase?}}");
  if (!p.sql.every(okSql)) return error(400, "payload.sql: one INSERT/UPDATE/DELETE on articles, article_records, threads or posts per item");
  if (!p.urls.every(okUrl)) return error(400, "payload.urls: https://realufo.org/ links only");
  if (sc !== undefined && (typeof sc?.record !== "string" || typeof sc?.text !== "string")) return error(400, "payload.showcase: {record, text}");
  const job = await createJob(env, { kind: "article", stream: "article", ref: b.ref, status: "post_wait", caption: b.caption ?? null, media: b.media ?? null, payload: p });
  if (!job) return error(409, `an open job already exists for ${b.ref}`);
  await preview(env, job);
  return json({ ok: true, job: job.id });
}
