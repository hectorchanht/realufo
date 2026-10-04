import type { Env } from "../../env";
import { sqlTime } from "../xpick";
import { SocialError, readJson, log } from "./common";

// Rotating tokens (Spec 5 §5). Threads: 60-day token, refresh when < 7 days left.
// TikTok: 24 h access + 365 d refresh token, refresh when < 6 h left (> the 3 h cron, so a
// refresh error is retried while the old token still works). tick() calls token() on every
// cron tick, not only when there is something to post.

export type Rotating = "threads" | "tiktok";
type Row = { access_token: string; refresh_token: string | null; expires_at: string | null };
type Fresh = { access: string; refresh?: string; expiresIn: number };
const LEAD: Record<Rotating, number> = { threads: 7 * 86400_000, tiktok: 6 * 3600_000 };

async function refreshThreads(access: string): Promise<Fresh> {
  const q = new URLSearchParams({ grant_type: "th_refresh_token", access_token: access });
  const j = await readJson(await fetch(`https://graph.threads.net/refresh_access_token?${q}`));
  return { access: j.access_token, expiresIn: j.expires_in };
}

async function refreshTikTok(env: Env, refresh: string): Promise<Fresh> {
  const body = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY ?? "", client_secret: env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: refresh });
  // Explicit type: fetch's default for URLSearchParams adds ";charset=UTF-8", which TikTok
  // rejects as invalid_request ("The request parameters are malformed.").
  const j = await readJson(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  }));
  if (!j.access_token) throw new SocialError(400, JSON.stringify(j).slice(0, 300));
  return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in };
}

export async function token(env: Env, platform: Rotating, now: Date): Promise<string> {
  const row = await env.DB.prepare("SELECT access_token, refresh_token, expires_at FROM social_auth WHERE platform=?").bind(platform).first<Row>();
  if (!row) throw new SocialError(401, `no ${platform} token in social_auth (run python -m ingest.social_auth ${platform})`);
  const exp = row.expires_at ? Date.parse(row.expires_at.replace(" ", "T") + "Z") : Infinity;
  if (exp - now.getTime() > LEAD[platform]) return row.access_token;
  try {
    const t = platform === "threads" ? await refreshThreads(row.access_token) : await refreshTikTok(env, row.refresh_token ?? "");
    await env.DB.prepare("UPDATE social_auth SET access_token=?, refresh_token=coalesce(?, refresh_token), expires_at=?, updated_at=? WHERE platform=?")
      .bind(t.access, t.refresh ?? null, sqlTime(new Date(now.getTime() + t.expiresIn * 1000)), sqlTime(now), platform).run();
    log({ platform, refreshed: true });
    return t.access;
  } catch (e) {
    log({ platform, refreshFailed: String(e).slice(0, 200) });
    if (exp > now.getTime()) return row.access_token;
    throw new SocialError(401, `${platform} token expired and refresh failed: ${String(e).slice(0, 300)}`);
  }
}
