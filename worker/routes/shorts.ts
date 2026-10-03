import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";
import { thumbSql } from "../lib/db";
import { ftsQuery, metaMatch } from "./records";

export type Short = {
  id: string; title: string | null; thumb: string | null; clip: string; showcase: boolean;
  /** Player-only likes (short_likes); `liked` = this visitor's. `comments` = the record's. */
  likes: number; liked: boolean; comments: number;
};
const MAX = 200;

// ponytail: per-isolate 5-min memo of the two R2 listings (each a Class A op;
// the archive strip calls this per debounced search). A new Short shows up within
// 5 min; key by bucket binding so a different/broken binding never hits it.
const TTL_MS = 5 * 60_000;
type Listing = Map<string, string>; // record id → etag
let memo = new WeakMap<object, { at: number; ids: Promise<[Listing, Listing]> }>();
async function list(env: Env, prefix: string): Promise<Listing> {
  const out: Listing = new Map();
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix, cursor });
    for (const o of page.objects) out.set(o.key.split("/").pop()!.replace(/\.mp4$/, ""), o.etag);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}
function listings(env: Env): Promise<[Listing, Listing]> {
  const hit = memo.get(env.MEDIA);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  const ids = Promise.all([list(env, "showcase/"), list(env, "clips-v/")]);
  memo.set(env.MEDIA, { at: Date.now(), ids });
  ids.catch(() => memo.delete(env.MEDIA)); // never memoize a failure
  return ids;
}
// Tests seed R2 per file; the memo would otherwise outlive a file's storage.
export const clearShortsMemo = () => {
  memo = new WeakMap();
};

// A Short = a live record with a 9:16 video in R2: an operator showcase Short
// (showcase/, scripts/publish.sh --showcase, wins) or the auto-cut twin (clips-v/).
// The object's existence is the flag — no D1 table. Order: showcase by newest
// post, showcase without a post row, then twins (portrait sources first — their
// twin is the whole picture — then newest). q = the archive search (metadata or
// page text) or, for showcase Shorts, every word in the posted text.
// total = every match, not just this page (0 for an offset past the end).
// Never throws: an R2/D1 error is logged and an empty list (the feed must not fail).
// actor = the visitor's anon id hash ("" = none: liked is always false).
export async function queryShorts(env: Env, { q = "", limit = MAX, offset = 0, actor = "" }: { q?: string; limit?: number; offset?: number; actor?: string } = {}): Promise<{ shorts: Short[]; total: number }> {
  try {
    const [sc, cv] = await listings(env);
    const showcase = [...sc.keys()], twins = [...cv.keys()];
    if (!showcase.length && !twins.length) return { shorts: [], total: 0 };
    const where = ["r.status='live'", "(r.id IN (SELECT id FROM sc) OR r.id IN (SELECT id FROM cv))"];
    const bind: unknown[] = [JSON.stringify(showcase), JSON.stringify(twins), actor];
    q = q.trim();
    if (q) {
      const meta = metaMatch(q);
      const fts = ftsQuery(q);
      const text = meta.bind.length
        ? `EXISTS (SELECT 1 FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id AND ${meta.bind.map(() => "lower(x.text) LIKE ?").join(" AND ")})`
        : "0";
      where.push(`((${meta.sql})${fts ? " OR r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?)" : ""} OR (r.id IN (SELECT id FROM sc) AND ${text}))`);
      bind.push(...meta.bind, ...(fts ? [fts] : []), ...meta.bind);
    }
    const { results } = await env.DB.prepare(
      `WITH sc(id) AS (SELECT value FROM json_each(?)), cv(id) AS (SELECT value FROM json_each(?))
       SELECT r.id, r.archive, r.title, ${thumbSql("r.id")} thumb, count(*) OVER () total,
         (SELECT count(*) FROM short_likes l WHERE l.record_id=r.id) likes,
         EXISTS (SELECT 1 FROM short_likes l WHERE l.record_id=r.id AND l.actor_id=?) liked,
         (SELECT count(*) FROM comments c WHERE c.record_id=r.id) comments,
         r.id IN (SELECT id FROM sc) showcase,
         CASE WHEN r.id IN (SELECT id FROM sc) THEN (SELECT max(x.created_at) FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id) END posted,
         (SELECT CAST(substr(a.crop, 1, instr(a.crop, ':') - 1) AS INT) < CAST(substr(a.crop, instr(a.crop, ':') + 1) AS INT)
            FROM assets a WHERE a.record_id=r.id AND a.role='full') portrait
       FROM records r WHERE ${where.join(" AND ")}
       ORDER BY showcase DESC, posted DESC, portrait DESC, r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`
    ).bind(...bind, Math.min(MAX, Math.max(1, Math.floor(limit) || MAX)), Math.max(0, Math.floor(offset) || 0))
      .all<{ id: string; archive: string; title: string | null; thumb: string | null; showcase: number; total: number; likes: number; liked: number; comments: number }>();
    const shorts = results.map(({ id, archive, title, thumb, showcase, likes, liked, comments }) => ({
      id, title, thumb, showcase: !!showcase, likes, liked: !!liked, comments,
      // ?v=etag: assets.realufo.org caches a month, so a re-cut Short gets a new URL.
      clip: `https://assets.realufo.org/${showcase ? "showcase" : "clips-v"}/${archive}/${encodeURIComponent(id)}.mp4?v=${(showcase ? sc : cv).get(id)!.slice(0, 8)}`,
    }));
    return { shorts, total: results[0]?.total ?? 0 };
  } catch (e) {
    console.error("listShorts", e);
    return { shorts: [], total: 0 };
  }
}

export const listShorts = async (env: Env, opts?: Parameters<typeof queryShorts>[1]) => (await queryShorts(env, opts)).shorts;

// GET /api/shorts?q=&limit=&offset= → { shorts, total } — the Shorts player
// queue (paged), the archive search strip and the archive Shorts grid.
export async function shorts(req: Request, env: Env) {
  const u = new URL(req.url);
  const n = (k: string) => Number(u.searchParams.get(k)) || 0;
  const actor = await actorId(req, env.ANON_SALT);
  return json(await queryShorts(env, { actor: actor === "anon:none" ? "" : actor, q: u.searchParams.get("q") ?? "", limit: n("limit") || MAX, offset: n("offset") }));
}

// POST /api/shorts/:id/like — toggle this visitor's like → { liked, likes }.
export async function likeShort(req: Request, env: Env, p: Record<string, string>) {
  const actor = await actorId(req, env.ANON_SALT);
  if (actor === "anon:none") return error(400, "missing anon id");
  if (!(await env.DB.prepare("SELECT 1 FROM records WHERE id=? AND status='live'").bind(p.id).first())) return error(404, "record not found");
  if (!(await allowWrite(env, req, "vote"))) return error(429, "slow down — too many likes");
  const gone = await env.DB.prepare("DELETE FROM short_likes WHERE actor_id=? AND record_id=?").bind(actor, p.id).run();
  const liked = !gone.meta.changes;
  if (liked) await env.DB.prepare("INSERT INTO short_likes(actor_id,record_id) VALUES(?,?)").bind(actor, p.id).run();
  const row = await env.DB.prepare("SELECT count(*) n FROM short_likes WHERE record_id=?").bind(p.id).first<{ n: number }>();
  return json({ liked, likes: row?.n ?? 0 });
}
