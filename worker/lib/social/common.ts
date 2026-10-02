import type { Env } from "../../env";

// Shared types for the social fan-out (Spec 5). Adapters throw SocialError for
// HTTP errors; anything else (network) is treated as "may have posted".

export type Platform = "fb" | "ig" | "threads" | "bsky" | "yt" | "tiktok";
export type Sleep = (ms: number) => Promise<void>;
export type Ctx = { now: Date; sleep: Sleep };
export type SocialMedia = { kind: "video" | "image"; key: string; url: string; size: number };
export type SocialPost = { text: string; title: string; link: string | null; media: SocialMedia | null };
export type Published = { remoteId: string } | { containerId: string };
export type Finished = { remoteId: string } | "processing";

export interface Adapter {
  needs: "video" | "media" | "any";
  vertical: boolean;
  configured(env: Env): boolean;
  publish(env: Env, p: SocialPost, ctx: Ctx): Promise<Published>;
  finish?(env: Env, p: SocialPost, containerId: string, ctx: Ctx): Promise<Finished>;
}

export class SocialError extends Error {
  constructor(public status: number, public body: string) {
    super(`social ${status}: ${body.slice(0, 300)}`);
  }
}

// Meta returns expired/revoked tokens as HTTP 400 with error code 190.
export const isAuth = (e: SocialError) => e.status === 401 || /"code"\s*:\s*190\b/.test(e.body);

export async function readJson(res: Response): Promise<any> {
  const body = await res.text();
  if (!res.ok) throw new SocialError(res.status, body);
  try {
    return JSON.parse(body);
  } catch {
    throw new SocialError(502, `non-JSON response: ${body.slice(0, 200)}`);
  }
}

export const log = (o: Record<string, unknown>) => console.log(JSON.stringify({ social: true, ...o }));
export const CDN = "https://assets.realufo.org/";
export const wait: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
