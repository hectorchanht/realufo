import type { Env } from "../env";
import { json, error } from "../lib/json";
import { thumbSql } from "../lib/db";
import { allowWrite } from "../lib/ratelimit";
import { actorId } from "../lib/anon";
import { isoDate, wargovReleases } from "../lib/facets";
import { hubsFor } from "../lib/hubs";
import { listHubsCached } from "./hubs";
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
  if (hit) {
    const b = JSON.parse(hit.answer);
    // Cache hits skip the limiter, so log one only if the browser is under its own limit.
    const log_id = (await allowWrite(env, req, "ask_hit")) ? await logAsk(env, req, q, b.sources?.length ?? 0, true) : null;
    return json({ ...b, sources: await withHubs(env, req, b.sources ?? []), cached: true, log_id });
  }

  // allowWrite records a browser row AND an `ip:` row per request; count browser rows only.
  const used = await env.DB.prepare(
    "SELECT count(*) c FROM rate_events WHERE action='ask' AND actor_id NOT LIKE 'ip:%' AND created_at >= date('now')"
  ).first<{ c: number }>();
  if ((used?.c ?? 0) >= (Number(env.ASK_DAILY_MAX) || 2000)) return error(503, RESTING);
  if (!(await allowWrite(env, req, "ask"))) return error(429, "slow down — too many questions");

  let body: { question: string; answer: string; sources: unknown[] };
  try {
    body = { question: q, ...(await answer(env, q, min)) };
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
  return json({
    ...body,
    sources: await withHubs(env, req, body.sources),
    cached: false,
    log_id: await logAsk(env, req, q, body.sources.length, false),
  });
}

// Hub links per source (hub pages Task 5b). Added per response, never stored in
// ask_cache, so cached answers follow the live hub list. Garnish only: any
// failure returns the sources unchanged.
async function withHubs(env: Env, req: Request, sources: unknown[]) {
  const list = sources as { record_id: string }[];
  if (!list.length) return sources;
  try {
    const ids = [...new Set(list.map((s) => s.record_id))];
    const [rows, hubList, releases] = await Promise.all([
      env.DB.prepare(
        `SELECT id,agency,location,incident_date,archive,doc_date FROM records WHERE id IN (${ids.map(() => "?").join(",")})`
      )
        .bind(...ids)
        .all<{ id: string; agency: string | null; location: string | null; incident_date: string | null; archive: string; doc_date: string | null }>(),
      listHubsCached(env, new URL(req.url).origin),
      wargovReleases(env),
    ]);
    const live = new Set(hubList.map((h) => `${h.kind}/${h.slug}`));
    const byId = new Map(rows.results.map((r) => [r.id, r]));
    return list.map((s) => {
      const r = byId.get(s.record_id);
      if (!r) return s;
      // Same rule as records.ts releaseOf: a war.gov file's doc_date is its release date.
      const date = r.archive === "wargov" && r.doc_date ? isoDate(r.doc_date) : null;
      const release = date ? (releases.find((x) => x.date === date)?.no ?? null) : null;
      return { ...s, hubs: hubsFor(r, release, live) };
    });
  } catch (e) {
    console.error("ask hub links failed", e);
    return sources;
  }
}

async function logAsk(env: Env, req: Request, q: string, sources: number, cached: boolean) {
  const row = await env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,cached) VALUES(?,?,?,?) RETURNING id")
    .bind(q, await actorId(req, env.ANON_SALT), sources, cached ? 1 : 0)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// POST /api/ask/:id/public {public: boolean} — the asker shares (or unshares)
// their own answered question. Anything else is a 404 so ids can't be probed.
export async function setAskPublic(req: Request, env: Env, params: Record<string, string>) {
  const b = await req.json<any>().catch(() => ({}));
  if (typeof b.public !== "boolean") return error(400, "public must be true or false");
  const actor = await actorId(req, env.ANON_SALT);
  if (actor === "anon:none") return error(404, "not found");
  if (!(await allowWrite(env, req, "ask_share"))) return error(429, "slow down");
  const r = await env.DB.prepare("UPDATE ask_log SET public=? WHERE id=? AND actor_id=? AND sources>0")
    .bind(b.public ? 1 : 0, Number(params.id) || 0, actor)
    .run();
  if (!r.meta.changes) return error(404, "not found");
  return json({ public: b.public });
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

// GET /api/ask/recent — questions their askers chose to share, newest first,
// one entry per distinct question. Free: no AI, no rate row.
export async function recentAsks(_req: Request, env: Env) {
  if (env.FEATURE_ASK !== "on" && env.FEATURE_ASK !== "hidden") return error(503, RESTING);
  const rows = await env.DB.prepare(
    `SELECT question, sources, created_at asked_at FROM ask_log WHERE id IN (
       SELECT max(id) FROM ask_log WHERE public=1 GROUP BY lower(question)
     ) ORDER BY id DESC LIMIT 20`
  ).all<{ question: string; sources: number; asked_at: string }>();
  return json({ recent: rows.results });
}
