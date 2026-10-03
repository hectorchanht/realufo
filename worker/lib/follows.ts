// Follows (spec 2026-10-03-realufo-pwa-push-design §2a). Keyed by the salted anon actor,
// not by push subscription, so following before enabling notifications still counts.
import type { Env } from "../env";
import { docHref } from "./ssr";
import { AGENCY_HUBS, LOCATION_HUBS } from "./hubs";
import { TOPIC_RULES } from "./topics";

export type FollowKind = "thread" | "record" | "case" | "hub";

// Posting somewhere follows it ('auto'); obeys the subscriber's "replies" pref.
export const autoFollow = (env: Env, actor: string | null, kind: FollowKind, key: string) =>
  actor
    ? env.DB.prepare("INSERT OR IGNORE INTO follows(actor_id,kind,key,src) VALUES(?,?,?,'auto')").bind(actor, kind, key).run()
    : Promise.resolve();

// After the response: ctx.waitUntil in production. Tests pass a ctx without waitUntil,
// so the work is awaited inline there (no D1 calls dangling past the test).
export function later(ctx: ExecutionContext | undefined, p: Promise<unknown>) {
  const safe = p.catch((e) => console.error("later", e));
  return ctx?.waitUntil ? ctx.waitUntil(safe) : safe;
}

export const followUrl = (kind: FollowKind, key: string) =>
  kind === "thread" ? `/thread/${encodeURIComponent(key)}` : kind === "record" ? docHref(key) : kind === "case" ? `/case/${encodeURIComponent(key)}` : `/${key}`;

// Followable hubs. Releases are not: new files always land under a new release slug.
const HUBS: Record<string, string> = Object.fromEntries([
  ...AGENCY_HUBS.map((h) => [`agency/${h.slug}`, h.label]),
  ...LOCATION_HUBS.map((h) => [`location/${h.slug}`, h.label]),
  ...TOPIC_RULES.map((t) => [`topic/${t.slug}`, t.label]),
]);
export const hubLabel = (key: string): string | undefined => HUBS[key];
