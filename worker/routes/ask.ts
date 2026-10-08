import type { Env } from "../env";
import { json, error } from "../lib/json";
import { thumbSql } from "../lib/db";
import { allowWrite } from "../lib/ratelimit";
import { actorId } from "../lib/anon";
import { isoDate, wargovReleases } from "../lib/facets";
import { hubsFor } from "../lib/hubs";
import { listHubsCached } from "./hubs";
import {
  ASK_EMBED_MODEL, ASK_LLM_MODEL, ASK_RERANK_MODEL, ASK_TOP_K, ASK_POOL, ASK_PER_RECORD, NOT_COVERED, RESTING,
  askHref, askIdOf, normalizeQuestion, cacheKey, buildMessages, answerText, cleanCitations, aiSourceOf, type AskChunk,
} from "../lib/ask";

type Hydrated = { id: string; title: string; kind: string; thumb: string | null };
const notCovered = () => ({ answer: NOT_COVERED, sources: [] as unknown[] });

// GET /api/ask?q= — Spec 3 §4.3. Order matters: flag, validate, cache (free),
// daily cap (records nothing), limiter, then the paid AI calls.
export async function ask(req: Request, env: Env) {
  if (env.FEATURE_ASK !== "on" && env.FEATURE_ASK !== "hidden") return error(503, RESTING);
  const q = normalizeQuestion(new URL(req.url).searchParams.get("q"));
  if (!q) return error(400, "question must be 3–300 characters");
  // Threshold and prompt version are part of the key so re-tuning either never serves stale answers.
  const min = Number(env.ASK_MIN_SCORE) || 0.45;
  const key = `${min}|p3|${cacheKey(q)}`;

  const hit = await env.DB.prepare("SELECT answer FROM ask_cache WHERE key=? AND created_at >= datetime('now','-7 days')")
    .bind(key)
    .first<{ answer: string }>();
  if (hit) {
    const b = JSON.parse(hit.answer);
    // Cache hits skip the limiter, so log one only if the browser is under its own limit.
    const log_id = (await allowWrite(env, req, "ask_hit"))
      ? await logAsk(env, req, q, { answer: b.answer, sources: b.sources ?? [] }, true)
      : null;
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
    log_id: await logAsk(env, req, q, body, false),
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

async function logAsk(env: Env, req: Request, q: string, data: { answer: string; sources: unknown[] }, cached: boolean) {
  // Frozen copy for shared pages; hub links are never stored (they follow the live hub list).
  const frozen = JSON.stringify({ answer: data.answer, sources: data.sources });
  const row = await env.DB.prepare("INSERT INTO ask_log(question,actor_id,sources,cached,answer) VALUES(?,?,?,?,?) RETURNING id")
    .bind(q, await actorId(req, env.ANON_SALT), data.sources.length, cached ? 1 : 0, frozen)
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
  const r = await env.DB.prepare(
    "UPDATE ask_log SET public=? WHERE id=? AND actor_id=? AND sources>0 AND (?=0 OR answer IS NOT NULL) RETURNING id, question"
  )
    .bind(b.public ? 1 : 0, Number(params.id) || 0, actor, b.public ? 1 : 0)
    .first<{ id: number; question: string }>();
  if (!r) return error(404, "not found");
  return json({ public: b.public, url: askHref(r.id, r.question) });
}

async function answer(env: Env, q: string, min: number) {
  const emb = (await env.AI.run(ASK_EMBED_MODEL as any, { text: [q] } as any)) as unknown as { data: number[][] };
  const res = await env.VECTORIZE.query(emb.data[0], { topK: ASK_POOL, returnMetadata: "all" });
  const strong = res.matches.filter((m) => m.score >= min && m.metadata?.record_id);
  // Dense retrieval can miss (or weakly rank) a term the archive names outright
  // ("PURSUE" scores below the threshold even though an AI summary says "the
  // PURSUE initiative"): merge keyword hits over titles/summaries/AI summaries
  // into the pool, then let the reranker + LLM judge relevance as usual.
  const vec = strong.map((m) => ({
    record_id: String(m.metadata!.record_id),
    page: Number(m.metadata!.page) || 0,
    text: String(m.metadata!.text ?? ""),
  }));
  const seen = new Set(vec.map((r) => r.record_id));
  const kw = await keywordChunks(env, q).catch(() => [] as { record_id: string; page: number; text: string }[]);
  const raw = [...vec, ...kw.filter((r) => !seen.has(r.record_id))];
  if (!raw.length) return notCovered();

  // Hydrate from D1; a chunk whose record was deleted is dropped.
  const ids = [...new Set(raw.map((r) => r.record_id))];
  const rows = await env.DB.prepare(
    `SELECT id,title,kind,${thumbSql("records.id")} thumb FROM records WHERE id IN (${ids.map(() => "?").join(",")})`
  )
    .bind(...ids)
    .all<Hydrated>();
  const byId = new Map(rows.results.map((r) => [r.id, r]));
  const pool = raw.filter((r) => byId.has(r.record_id));
  if (!pool.length) return notCovered();

  const perRecord = new Map<string, number>();
  const chunks: AskChunk[] = (await rerank(env, q, pool))
    .filter((c) => {
      const k = (perRecord.get(c.record_id) ?? 0) + 1;
      perRecord.set(c.record_id, k);
      return k <= ASK_PER_RECORD;
    })
    .slice(0, ASK_TOP_K)
    .map((c, i) => ({ n: i + 1, ...c }));

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
      const ai = aiSourceOf(c.text);
      return { n: c.n, record_id: c.record_id, title: r.title, page: c.page, kind: r.kind, thumb: r.thumb ?? null, ...(ai && { ai }) };
    }),
  };
}

// Keyword fallback for answer(): distinctive question terms matched against
// titles/summaries/AI summaries. Ranked by how many terms hit, capped, then
// the normal rerank + LLM path judges relevance.
const ASK_STOPWORDS = new Set(
  "what is the a an of and or to in on for with as by at from that this these those it its be are was were who which whose whom how why when where do does did can could should would will shall there their them they we you your our ours his her him she he i me my mine our the this that these those am is are was were be been being have has had having do does did doing will would shall should may might must can could".split(" ")
);
const escLike = (s: string) => s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
async function keywordChunks(env: Env, q: string): Promise<{ record_id: string; page: number; text: string }[]> {
  const seen = new Set<string>();
  const kws = ((q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => w.length >= 3 && !ASK_STOPWORDS.has(w) && !seen.has(w) && seen.add(w)
  )).slice(0, 6);
  if (!kws.length) return [];
  const hay = "lower(r.title || ' ' || coalesce(r.summary,'') || ' ' || coalesce(t.ai_summary,''))";
  const ors = kws.map(() => `(${hay} LIKE ? ESCAPE '\\')`).join(" OR ");
  const rows = await env.DB.prepare(
    `SELECT r.id record_id, r.title title,
       coalesce(t.ai_summary, r.summary, '') summary
     FROM records r LEFT JOIN record_text t ON t.record_id = r.id
     WHERE r.status='live' AND (${ors}) LIMIT 24`
  )
    .bind(...kws.map((k) => `%${escLike(k)}%`))
    .all<{ record_id: string; title: string; summary: string }>();
  const hits = rows.results
    .map((r) => {
      const h = `${r.title} ${r.summary}`.toLowerCase();
      return { r, n: kws.filter((k) => h.includes(k)).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 12);
  return hits.map(({ r }) => ({
    record_id: r.record_id,
    page: 0,
    // Same "<title> — AI summary" head the indexer uses, so aiSourceOf labels it.
    text: `${r.title} — AI summary\n${r.summary.slice(0, 1500)}`,
  }));
}

// Pool in reranker order; any reranker failure keeps the vector order.
async function rerank<T extends { text: string }>(env: Env, q: string, pool: T[]): Promise<T[]> {
  try {
    const out = (await env.AI.run(ASK_RERANK_MODEL as any, { query: q, contexts: pool.map((c) => ({ text: c.text })) } as any)) as {
      response?: { id: number; score: number }[];
    };
    const ranked = [...(out.response ?? [])].sort((a, b) => b.score - a.score).map((r) => pool[r.id]).filter(Boolean);
    return ranked.length === pool.length ? ranked : pool;
  } catch (e) {
    console.error("ask rerank failed", e);
    return pool;
  }
}

// GET /api/ask/recent — questions their askers chose to share, newest first,
// one entry per distinct question. Free: no AI, no rate row.
export async function recentAsks(_req: Request, env: Env) {
  if (env.FEATURE_ASK !== "on" && env.FEATURE_ASK !== "hidden") return error(503, RESTING);
  // One entry per question, newest share first, pointing at the question's
  // canonical row: the earliest public row with a stored answer (else the newest).
  const rows = await env.DB.prepare(
    `SELECT a.id, a.question, a.sources, a.created_at asked_at, a.answer IS NOT NULL has_answer
     FROM (SELECT max(id) last, COALESCE(min(CASE WHEN answer IS NOT NULL THEN id END), max(id)) pick
           FROM ask_log WHERE public=1 GROUP BY lower(question)) g
     JOIN ask_log a ON a.id = g.pick
     ORDER BY g.last DESC LIMIT 20`
  ).all<{ id: number; question: string; sources: number; asked_at: string; has_answer: number }>();
  return json({
    recent: rows.results.map(({ has_answer, ...r }) => ({ ...r, url: has_answer ? askHref(r.id, r.question) : null })),
  });
}

export type SharedAskSource = { n: number; record_id: string; title: string; page: number; kind: string; thumb: string | null; ai?: "summary" | "moments" };
export type SharedAsk = { id: number; question: string; answer: string; sources: SharedAskSource[]; asked_at: string; url: string };

// A shared answer exactly as frozen in ask_log (Spec 8 §1.5). Private rows, rows
// from before answers were stored, and unreadable JSON are all "not found".
export async function loadSharedAsk(env: Env, id: number | null): Promise<SharedAsk | null> {
  if (!id) return null;
  const row = await env.DB.prepare("SELECT id, question, answer, created_at FROM ask_log WHERE id=? AND public=1 AND answer IS NOT NULL")
    .bind(id)
    .first<{ id: number; question: string; answer: string; created_at: string }>();
  if (!row) return null;
  try {
    const a = JSON.parse(row.answer);
    if (typeof a?.answer !== "string" || !Array.isArray(a.sources)) return null;
    return { id: row.id, question: row.question, answer: a.answer, sources: a.sources, asked_at: row.created_at, url: askHref(row.id, row.question) };
  } catch {
    return null;
  }
}

// GET /api/asks/:id — free (no AI, no rate row) and not behind FEATURE_ASK:
// indexed pages must not vanish when new asks are paused.
export async function getSharedAsk(req: Request, env: Env, params: Record<string, string>) {
  const a = await loadSharedAsk(env, askIdOf(params.id));
  if (!a) return error(404, "not found");
  return json({ ...a, sources: await withHubs(env, req, a.sources) }, { headers: { "cache-control": "public, max-age=300" } });
}
