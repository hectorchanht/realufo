import type { Env } from "../../env";
import { SocialError, readJson, type Adapter } from "./common";
import { token } from "./auth";

// TikTok Content Posting API, Direct Post (Spec 5 §4). Unaudited apps may only post
// SELF_ONLY; TIKTOK_PRIVACY flips after the audit. assets.realufo.org must be a
// verified URL prefix for PULL_FROM_URL.

const API = "https://open.tiktokapis.com/v2";

async function call(path: string, tok: string, body: unknown): Promise<any> {
  const j = await readJson(await fetch(`${API}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body),
  }));
  if (j.error?.code && j.error.code !== "ok") throw new SocialError(400, JSON.stringify(j.error));
  return j.data ?? {};
}

export const tiktok: Adapter = {
  needs: "video",
  vertical: true,
  configured: (env) => !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
  async publish(env, p, ctx) {
    const tok = await token(env, "tiktok", ctx.now);
    const privacy = env.TIKTOK_PRIVACY || "SELF_ONLY";
    const info = await call("/post/publish/creator_info/query/", tok, {});
    if (!(info.privacy_level_options ?? []).includes(privacy)) throw new SocialError(400, `privacy ${privacy} not offered: ${info.privacy_level_options}`);
    const d = await call("/post/publish/video/init/", tok, {
      post_info: { title: p.text, privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: p.media!.url },
    });
    return { containerId: String(d.publish_id) };
  },
  async finish(env: Env, _p, publishId, ctx) {
    const d = await call("/post/publish/status/fetch/", await token(env, "tiktok", ctx.now), { publish_id: publishId });
    if (d.status === "PUBLISH_COMPLETE") return { remoteId: String(d.publicaly_available_post_id?.[0] ?? publishId) }; // [sic] TikTok's field name
    if (d.status === "FAILED") throw new SocialError(422, `tiktok ${d.fail_reason ?? "failed"}`);
    return "processing";
  },
};
