import type { Env } from "../../env";
import { SocialError, readJson, type Adapter, type Ctx, type Finished, type Published, type SocialPost } from "./common";
import { token } from "./auth";

// Facebook Page, Instagram and Threads (Spec 5 §4). IG and Threads publish in two
// steps: create a media container, wait for it to process, then publish it.

export const GRAPH = "https://graph.facebook.com/v25.0";
export const THREADS_API = "https://graph.threads.net/v1.0";
const POLLS = 6;
const POLL_MS = 10_000;

async function graph(url: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<any> {
  const q = new URLSearchParams(params);
  return readJson(method === "GET" ? await fetch(`${url}?${q}`) : await fetch(url, { method, body: q }));
}

type Box = { base: string; user: string; token: string; statusField: "status_code" | "status"; publish: "media_publish" | "threads_publish" };

async function finishBox(b: Box, id: string): Promise<Finished> {
  const s = (await graph(`${b.base}/${id}`, { fields: b.statusField, access_token: b.token }, "GET"))[b.statusField];
  if (s === "IN_PROGRESS") return "processing";
  if (s !== "FINISHED") throw new SocialError(422, `container ${s}`);
  const r = await graph(`${b.base}/${b.user}/${b.publish}`, { creation_id: id, access_token: b.token });
  return { remoteId: String(r.id) };
}

async function boxFlow(b: Box, params: Record<string, string>, ctx: Ctx, path: "media" | "threads"): Promise<Published> {
  const { id } = await graph(`${b.base}/${b.user}/${path}`, { ...params, access_token: b.token });
  for (let i = 0; i < POLLS; i++) {
    const f = await finishBox(b, String(id));
    if (f !== "processing") return f;
    await ctx.sleep(POLL_MS);
  }
  return { containerId: String(id) };
}

export const fb: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!(env.META_PAGE_ID && env.META_PAGE_TOKEN),
  async publish(env, p) {
    const base = `${GRAPH}/${env.META_PAGE_ID}`;
    const access_token = env.META_PAGE_TOKEN!;
    const r =
      p.media?.kind === "video" ? await graph(`${base}/videos`, { file_url: p.media.url, description: p.text, access_token })
      : p.media ? await graph(`${base}/photos`, { url: p.media.url, caption: p.text, access_token })
      : await graph(`${base}/feed`, { message: p.text, ...(p.link ? { link: p.link } : {}), access_token });
    return { remoteId: String(r.post_id ?? r.id) };
  },
};

const igBox = (env: Env): Box => ({ base: GRAPH, user: env.IG_USER_ID!, token: env.META_PAGE_TOKEN!, statusField: "status_code", publish: "media_publish" });
const igParams = (p: SocialPost): Record<string, string> =>
  p.media!.kind === "video" ? { media_type: "REELS", video_url: p.media!.url, caption: p.text } : { image_url: p.media!.url, caption: p.text };

// Video only: IG accepts images between 4:5 and 1.91:1, and PDF page thumbs are portrait.
export const ig: Adapter = {
  needs: "video",
  vertical: true,
  configured: (env) => !!(env.IG_USER_ID && env.META_PAGE_TOKEN),
  publish: (env, p, ctx) => boxFlow(igBox(env), igParams(p), ctx, "media"),
  finish: (env, _p, id) => finishBox(igBox(env), id),
};

const threadsBox = async (env: Env, now: Date): Promise<Box> =>
  ({ base: THREADS_API, user: env.THREADS_USER_ID!, token: await token(env, "threads", now), statusField: "status", publish: "threads_publish" });
const threadsParams = (p: SocialPost): Record<string, string> =>
  p.media?.kind === "video" ? { media_type: "VIDEO", video_url: p.media.url, text: p.text }
  : p.media ? { media_type: "IMAGE", image_url: p.media.url, text: p.text }
  : { media_type: "TEXT", text: p.text };

export const threads: Adapter = {
  needs: "any",
  vertical: false,
  configured: (env) => !!env.THREADS_USER_ID,
  publish: async (env, p, ctx) => boxFlow(await threadsBox(env, ctx.now), threadsParams(p), ctx, "threads"),
  finish: async (env, _p, id, ctx) => finishBox(await threadsBox(env, ctx.now), id),
};
