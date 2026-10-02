import type { Env } from "../../env";
import { SocialError, readJson, type Adapter } from "./common";

// YouTube Shorts (Spec 5 §4). Access token minted from the refresh token every call
// (1 h lifetime, never stored). Until Google's API audit passes, uploads are locked private.

async function accessToken(env: Env): Promise<string> {
  const body = new URLSearchParams({ client_id: env.YT_CLIENT_ID!, client_secret: env.YT_CLIENT_SECRET!, refresh_token: env.YT_REFRESH_TOKEN!, grant_type: "refresh_token" });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (res.status === 400) throw new SocialError(401, await res.text()); // invalid_grant: refresh token revoked/expired
  return (await readJson(res)).access_token;
}

export const yt: Adapter = {
  needs: "video",
  vertical: true,
  configured: (env) => !!(env.YT_CLIENT_ID && env.YT_CLIENT_SECRET && env.YT_REFRESH_TOKEN),
  async publish(env, p) {
    const auth = `Bearer ${await accessToken(env)}`;
    const obj = await env.MEDIA.get(p.media!.key);
    if (!obj) throw new SocialError(404, `media missing in R2: ${p.media!.key}`);
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(obj.size) },
      body: JSON.stringify({ snippet: { title: p.title, description: p.text, categoryId: "28" }, status: { privacyStatus: "public", selfDeclaredMadeForKids: false } }),
    });
    if (!init.ok) throw new SocialError(init.status, await init.text());
    const loc = init.headers.get("Location");
    if (!loc) throw new SocialError(502, "resumable upload: no Location header");
    const r = await readJson(await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: await obj.arrayBuffer() }));
    return { remoteId: String(r.id) };
  },
};
