import type { Env } from "../../env";
import { mediaFor, sqlTime } from "../xpick";
import { SocialError, isAuth, log, CDN, wait, type Adapter, type Ctx, type Platform, type SocialMedia, type SocialPost, type Sleep } from "./common";
import { compose, archiveOf } from "./text";
import { fb, ig, threads } from "./meta";
import { bsky } from "./bsky";
import { yt } from "./yt";
import { tiktok } from "./tiktok";

// Social fan-out tick (Spec 5 §3): mirror posted x_posts to every enabled platform, one
// new post per platform per tick. Only status='posted': pending/processing X rows may still
// be deleted by xbot (401/402/403), which a social_posts FK would block. Row goes in BEFORE the platform is called:
// UNIQUE(x_post_id, platform) makes a second attempt a no-op.

export const ADAPTERS: Record<Platform, Adapter> = { fb, ig, threads, bsky, yt, tiktok };
const FLAG: Record<Platform, keyof Env> = {
  fb: "FEATURE_SOCIAL_FB", ig: "FEATURE_SOCIAL_IG", threads: "FEATURE_SOCIAL_THREADS",
  bsky: "FEATURE_SOCIAL_BSKY", yt: "FEATURE_SOCIAL_YT", tiktok: "FEATURE_SOCIAL_TIKTOK",
};
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 3600_000;

type XRow = { id: number; text: string; media: string | null };
type Row = { id: number; attempts: number; status: string; container_id: string | null; created_at: string; text: string; media: string | null };

async function image(env: Env, key: string): Promise<SocialMedia | null> {
  const o = await env.MEDIA.head(key);
  return o ? { kind: "image", key, url: CDN + key, size: o.size } : null;
}

// x_posts.media → what this platform gets. Vertical platforms use the clips-v/ twin;
// if it isn't cut yet, fall back to the record's thumb (as if there were no clip).
async function mediaOf(env: Env, media: string | null, vertical: boolean): Promise<SocialMedia | null> {
  if (!media) return null;
  const i = media.indexOf(":");
  const [kind, key] = [media.slice(0, i), media.slice(i + 1)];
  if (kind !== "clip") return image(env, key);
  const k = vertical ? key.replace(/^clips\//, "clips-v/") : key;
  const o = await env.MEDIA.head(k);
  if (o) return { kind: "video", key: k, url: CDN + k, size: o.size };
  const [, archive, file] = key.split("/");
  const t = await mediaFor(env, { id: file.replace(/\.mp4$/, ""), archive, kind: "image" });
  return t ? image(env, t.key) : null;
}

async function postFor(env: Env, p: Platform, a: Adapter, x: { text: string; media: string | null }): Promise<SocialPost> {
  const c = compose(p, x.text, archiveOf(x.media));
  return { ...c, media: await mediaOf(env, x.media, a.vertical) };
}

const gate = (a: Adapter, post: SocialPost): string | null =>
  a.needs === "video" && post.media?.kind !== "video" ? "no video" : a.needs === "media" && !post.media ? "no media" : null;

async function overCap(env: Env, p: Platform, now: Date): Promise<boolean> {
  if (p !== "yt") return false;
  const r = await env.DB.prepare("SELECT count(*) n FROM social_posts WHERE platform='yt' AND status IN ('posted','processing','pending') AND created_at >= ?")
    .bind(sqlTime(new Date(now.getTime() - 86400_000))).first<{ n: number }>();
  return (r?.n ?? 0) >= Number(env.YT_DAILY_MAX || 5);
}

async function fail(env: Env, p: Platform, row: { id: number; attempts: number }, e: unknown) {
  if (!(e instanceof SocialError)) {
    // may have posted (network error after send) → manual check, never auto-retried
    await env.DB.prepare("UPDATE social_posts SET status='pending', attempts=0, error=? WHERE id=?").bind(String(e).slice(0, 500), row.id).run();
    return log({ platform: p, ambiguous: row.id, error: String(e).slice(0, 200) });
  }
  if (isAuth(e)) {
    // token revoked/expired: nothing posted; drop the row so the item isn't burned while we're down
    await env.DB.prepare("DELETE FROM social_posts WHERE id=?").bind(row.id).run();
    return log({ platform: p, halted: row.id, status: e.status, body: e.body.slice(0, 200) });
  }
  const attempts = row.attempts + 1;
  const final = !(e.status === 429 || e.status >= 500) || attempts >= MAX_ATTEMPTS;
  await env.DB.prepare("UPDATE social_posts SET status=?, attempts=?, error=? WHERE id=?").bind(final ? "failed" : "pending", attempts, String(e).slice(0, 500), row.id).run();
  log({ platform: p, error: row.id, status: e.status, final });
}

async function send(env: Env, p: Platform, a: Adapter, row: { id: number; attempts: number }, post: SocialPost, ctx: Ctx) {
  try {
    const r = await a.publish(env, post, ctx);
    log({ platform: p, row: row.id, ...r }); // logged before the D1 write so a failed write is recoverable
    if ("remoteId" in r) await env.DB.prepare("UPDATE social_posts SET status='posted', remote_id=?, error=NULL WHERE id=?").bind(r.remoteId, row.id).run();
    else await env.DB.prepare("UPDATE social_posts SET status='processing', container_id=?, error=NULL WHERE id=?").bind(r.containerId, row.id).run();
  } catch (e) {
    await fail(env, p, row, e);
  }
}

async function resume(env: Env, p: Platform, a: Adapter, ctx: Ctx) {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.attempts, s.status, s.container_id, s.created_at, x.text, x.media FROM social_posts s JOIN x_posts x ON x.id=s.x_post_id
     WHERE s.platform=? AND (s.status='processing' OR (s.status='pending' AND s.attempts>0))`
  ).bind(p).all<Row>();
  for (const row of results) {
    const post = await postFor(env, p, a, row);
    if (row.status === "pending") { await send(env, p, a, row, post, ctx); continue; }
    try {
      const f = a.finish ? await a.finish(env, post, row.container_id!, ctx) : "processing";
      if (f !== "processing") {
        log({ platform: p, row: row.id, ...f });
        await env.DB.prepare("UPDATE social_posts SET status='posted', remote_id=?, error=NULL WHERE id=?").bind(f.remoteId, row.id).run();
        continue;
      }
    } catch (e) {
      // finish only polls and the post may already be live (TikTok publishes on its own after
      // init): never fall back to publish() or drop the row. 422 = platform rejected the media.
      if (e instanceof SocialError && e.status === 422) {
        await env.DB.prepare("UPDATE social_posts SET status='failed', error=? WHERE id=?").bind(String(e).slice(0, 500), row.id).run();
        continue;
      }
      log({ platform: p, finishError: row.id, error: String(e).slice(0, 200) });
    }
    if (Date.parse(row.created_at.replace(" ", "T") + "Z") < ctx.now.getTime() - TIMEOUT_MS)
      await env.DB.prepare("UPDATE social_posts SET status='failed', error='processing timeout' WHERE id=?").bind(row.id).run();
  }
}

async function runPlatform(env: Env, p: Platform, a: Adapter, mode: string, ctx: Ctx) {
  if (mode === "on" && !a.configured(env)) return log({ platform: p, skipped: "missing secrets" });
  if (mode === "on") await resume(env, p, a, ctx);
  const since = env.SOCIAL_SINCE ?? "";
  if (!since) return;
  const x = await env.DB.prepare(
    `SELECT x.id, x.text, x.media FROM x_posts x
     WHERE x.status='posted' AND x.created_at >= ?
       AND NOT EXISTS (SELECT 1 FROM social_posts s WHERE s.x_post_id=x.id AND s.platform=?)
     ORDER BY x.created_at, x.id LIMIT 1`
  ).bind(since, p).first<XRow>();
  if (!x) return;
  const post = await postFor(env, p, a, x);
  const blocked = gate(a, post) ?? ((await overCap(env, p, ctx.now)) ? "quota cap" : null);
  const status = blocked ? "failed" : mode === "dry" ? "draft" : "pending";
  const ins = await env.DB.prepare(
    "INSERT INTO social_posts(x_post_id,platform,status,error,created_at) VALUES (?,?,?,?,?) ON CONFLICT(x_post_id, platform) DO NOTHING RETURNING id"
  ).bind(x.id, p, status, blocked, sqlTime(ctx.now)).first<{ id: number }>();
  if (!ins) return;
  log({ platform: p, x: x.id, mode, status, blocked, media: post.media?.key ?? null });
  if (status === "pending") await send(env, p, a, { id: ins.id, attempts: 0 }, post, ctx);
}

export async function tick(env: Env, now = new Date(), sleep: Sleep = wait, adapters: Partial<Record<Platform, Adapter>> = ADAPTERS) {
  const ctx = { now, sleep };
  for (const [p, a] of Object.entries(adapters) as [Platform, Adapter][]) {
    const mode = (env[FLAG[p]] as string | undefined) ?? "off";
    if (mode !== "dry" && mode !== "on") continue;
    try {
      await runPlatform(env, p, a, mode, ctx);
    } catch (e) {
      log({ platform: p, crashed: String(e).slice(0, 300) });
    }
  }
}
