import type { Env } from "../../env";
import { SocialError, readJson, type Adapter, type Ctx, type Finished, type SocialPost } from "./common";
import { bskyFacets } from "./text";

// Bluesky (Spec 5 §4). Videos go through video.bsky.app (processed, then embedded);
// images ≤1 MB via uploadBlob. A new session per call: accessJwt is short-lived.

const ENTRY = "https://bsky.social/xrpc";
const VIDEO = "https://video.bsky.app/xrpc";
const IMAGE_MAX = 1_000_000;
const POLLS = 6;
const POLL_MS = 10_000;

type Session = { accessJwt: string; did: string; didDoc?: { service?: { serviceEndpoint: string }[] } };

const session = async (env: Env): Promise<Session> =>
  readJson(await fetch(`${ENTRY}/com.atproto.server.createSession`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_APP_PASSWORD }),
  }));

async function bytes(env: Env, key: string) {
  const o = await env.MEDIA.get(key);
  if (!o) throw new SocialError(404, `media missing in R2: ${key}`);
  return { body: await o.arrayBuffer(), type: o.httpMetadata?.contentType ?? "image/jpeg" };
}

// Unauthenticated, like the official tutorial: the PDS accessJwt isn't minted for video.bsky.app.
async function job(jobId: string): Promise<{ ref: unknown } | "processing"> {
  const { jobStatus } = await readJson(await fetch(`${VIDEO}/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`));
  if (jobStatus.state === "JOB_STATE_COMPLETED" && jobStatus.blob) return jobStatus.blob;
  if (jobStatus.state === "JOB_STATE_FAILED") throw new SocialError(422, `bsky video job failed: ${jobStatus.error ?? ""}`);
  return "processing";
}

async function uploadVideo(env: Env, s: Session, key: string, now: Date): Promise<string> {
  const pds = new URL(s.didDoc?.service?.[0]?.serviceEndpoint ?? "https://bsky.social").host;
  const q = new URLSearchParams({ aud: `did:web:${pds}`, lxm: "com.atproto.repo.uploadBlob", exp: String(Math.floor(now.getTime() / 1000) + 1800) });
  const { token } = await readJson(await fetch(`${ENTRY}/com.atproto.server.getServiceAuth?${q}`, { headers: { Authorization: `Bearer ${s.accessJwt}` } }));
  const { body } = await bytes(env, key);
  const name = key.split("/").pop()!;
  const res = await fetch(`${VIDEO}/app.bsky.video.uploadVideo?${new URLSearchParams({ did: s.did, name })}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" }, body,
  });
  const text = await res.text();
  const j = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!res.ok && !(res.status === 409 && j.jobId)) throw new SocialError(res.status, text); // 409 = same video already uploaded
  return String(j.jobId);
}

async function post(s: Session, p: SocialPost, now: Date, embed?: unknown) {
  const facets = bskyFacets(p.text);
  const record = { $type: "app.bsky.feed.post", text: p.text, createdAt: now.toISOString(), langs: ["en"], ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}) };
  const r = await readJson(await fetch(`${ENTRY}/com.atproto.repo.createRecord`, {
    method: "POST", headers: { Authorization: `Bearer ${s.accessJwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: s.did, collection: "app.bsky.feed.post", record }),
  }));
  return { remoteId: String(r.uri) };
}

const videoEmbed = (blob: unknown) => ({ $type: "app.bsky.embed.video", video: blob });

export const bsky: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!(env.BSKY_HANDLE && env.BSKY_APP_PASSWORD),
  async publish(env, p, ctx: Ctx) {
    const s = await session(env);
    if (p.media?.kind === "video") {
      const jobId = await uploadVideo(env, s, p.media.key, ctx.now);
      for (let i = 0; i < POLLS; i++) {
        const blob = await job(jobId);
        if (blob !== "processing") return post(s, p, ctx.now, videoEmbed(blob));
        await ctx.sleep(POLL_MS);
      }
      return { containerId: jobId };
    }
    if (p.media && p.media.size <= IMAGE_MAX) {
      const { body, type } = await bytes(env, p.media.key);
      const { blob } = await readJson(await fetch(`${ENTRY}/com.atproto.repo.uploadBlob`, { method: "POST", headers: { Authorization: `Bearer ${s.accessJwt}`, "Content-Type": type }, body }));
      return post(s, p, ctx.now, { $type: "app.bsky.embed.images", images: [{ alt: p.title, image: blob }] });
    }
    return post(s, p, ctx.now);
  },
  async finish(env, p, jobId, ctx): Promise<Finished> {
    const s = await session(env);
    const blob = await job(jobId);
    return blob === "processing" ? "processing" : post(s, p, ctx.now, videoEmbed(blob));
  },
};
