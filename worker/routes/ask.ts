import type { Env } from "../env";
import { json, error } from "../lib/json";
import { thumbSql } from "../lib/db";
import { allowWrite } from "../lib/ratelimit";
import {
  ASK_EMBED_MODEL, ASK_LLM_MODEL, ASK_TOP_K, NOT_COVERED, RESTING,
  normalizeQuestion, cacheKey, buildMessages, answerText, cleanCitations, type AskChunk,
} from "../lib/ask";

type Hydrated = { id: string; title: string; kind: string; thumb: string | null };
const notCovered = () => ({ answer: NOT_COVERED, sources: [] as unknown[] });

// GET /api/ask?q= — Spec 3 §4.3. Order matters: flag, validate, cache (free),
// daily cap (records nothing), limiter, then the paid AI calls.
export async function ask(req: Request, env: Env) {
  if (env.FEATURE_ASK !== "on" && env.FEATURE_ASK !== "hidden") return error(503, RESTING);
  const q = normalizeQuestion(new URL(req.url).searchParams.get("q"));
  if (!q) return error(400, "question must be 3–300 characters");
  // Threshold is part of the key so re-tuning ASK_MIN_SCORE never serves stale answers.
  const min = Number(env.ASK_MIN_SCORE) || 0.45;
  const key = `${min}|${cacheKey(q)}`;

  const hit = await env.DB.prepare("SELECT answer FROM ask_cache WHERE key=? AND created_at >= datetime('now','-7 days')")
    .bind(key)
    .first<{ answer: string }>();
  if (hit) return json({ ...JSON.parse(hit.answer), cached: true });

  // allowWrite records a browser row AND an `ip:` row per request; count browser rows only.
  const used = await env.DB.prepare(
    "SELECT count(*) c FROM rate_events WHERE action='ask' AND actor_id NOT LIKE 'ip:%' AND created_at >= date('now')"
  ).first<{ c: number }>();
  if ((used?.c ?? 0) >= (Number(env.ASK_DAILY_MAX) || 2000)) return error(503, RESTING);
  if (!(await allowWrite(env, req, "ask"))) return error(429, "slow down — too many questions");

  let body: { answer: string; sources: unknown[] };
  try {
    body = await answer(env, q, min);
  } catch {
    return error(503, RESTING);
  }
  // Only real answers are cached: a not-covered reply (e.g. asked mid-indexing)
  // must not stick for 7 days.
  if (body.sources.length)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ask_cache WHERE created_at < datetime('now','-7 days')"),
      env.DB.prepare("INSERT OR REPLACE INTO ask_cache(key,answer) VALUES(?,?)").bind(key, JSON.stringify(body)),
    ]);
  return json({ ...body, cached: false });
}

async function answer(env: Env, q: string, min: number) {
  const emb = (await env.AI.run(ASK_EMBED_MODEL as any, { text: [q] } as any)) as unknown as { data: number[][] };
  const res = await env.VECTORIZE.query(emb.data[0], { topK: ASK_TOP_K, returnMetadata: "all" });
  const strong = res.matches.filter((m) => m.score >= min && m.metadata?.record_id);
  if (!strong.length) return notCovered();

  // Hydrate from D1; a chunk whose record was deleted is dropped.
  const ids = [...new Set(strong.map((m) => String(m.metadata!.record_id)))];
  const rows = await env.DB.prepare(
    `SELECT id,title,kind,${thumbSql("records.id")} thumb FROM records WHERE id IN (${ids.map(() => "?").join(",")})`
  )
    .bind(...ids)
    .all<Hydrated>();
  const byId = new Map(rows.results.map((r) => [r.id, r]));
  const chunks: AskChunk[] = strong
    .filter((m) => byId.has(String(m.metadata!.record_id)))
    .map((m, i) => ({
      n: i + 1,
      record_id: String(m.metadata!.record_id),
      page: Number(m.metadata!.page) || 0,
      text: String(m.metadata!.text ?? ""),
    }));
  if (!chunks.length) return notCovered();

  const out = await env.AI.run(ASK_LLM_MODEL as any, {
    messages: buildMessages(q, chunks),
    max_tokens: 400,
    temperature: 0.2,
    chat_template_kwargs: { enable_thinking: false },
  } as any);
  const { text, cited } = cleanCitations(answerText(out), chunks.length);
  if (!text || text === NOT_COVERED) return notCovered();
  const shown = cited.length ? chunks.filter((c) => cited.includes(c.n)) : chunks;
  return {
    answer: text,
    sources: shown.map((c) => {
      const r = byId.get(c.record_id)!;
      return { n: c.n, record_id: c.record_id, title: r.title, page: c.page, kind: r.kind, thumb: r.thumb ?? null };
    }),
  };
}
