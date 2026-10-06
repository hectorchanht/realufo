// Public API v1 webhooks: developers subscribe a URL; the archive POSTs signed
// JSON when records appear or a new war.gov release lands.
// Delivery is HMAC-SHA256 signed (X-RealUFO-Signature) so receivers can verify.
// The webhook_subs table may not exist yet (migration 0043 is applied manually
// in the D1 dashboard): every query here fails soft — no subscribers, no crash.
import type { Env } from "../env";
import { getState, setState } from "./push";
import { wargovReleases } from "./facets";

export const WEBHOOK_EVENTS = ["records.created", "release.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookSub = {
  id: string; url: string; secret: string; events: string[];
  active: number; fails: number; created_at: string; last_ok_at: string | null;
};

const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

function parseEvents(raw: string | null): string[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((e) => WEBHOOK_EVENTS.includes(e)) : [];
  } catch {
    return [];
  }
}

/** https only (http allowed for localhost dev). Returns null when unacceptable. */
export function validWebhookUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u.toString();
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.toString();
  return null;
}

export async function createWebhook(env: Env, url: string, events?: string[]): Promise<WebhookSub & { secret: string }> {
  const clean = validWebhookUrl(url);
  if (!clean) throw new Error("url must be https");
  const wanted = events?.length ? events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)) : [...WEBHOOK_EVENTS];
  if (!wanted.length) throw new Error("events must include at least one of " + WEBHOOK_EVENTS.join(", "));
  const sub = {
    id: "wh_" + hex(12), url: clean, secret: hex(32),
    events: wanted, active: 1, fails: 0,
    created_at: new Date().toISOString(), last_ok_at: null,
  };
  await env.DB.prepare(
    "INSERT INTO webhook_subs(id,url,secret,events,active,fails,created_at) VALUES(?,?,?,?,?,?,?)"
  ).bind(sub.id, sub.url, sub.secret, JSON.stringify(sub.events), 1, 0, sub.created_at).run();
  return sub;
}

async function getSub(env: Env, id: string): Promise<WebhookSub | null> {
  const row = await env.DB.prepare("SELECT * FROM webhook_subs WHERE id=?").bind(id)
    .first<{ id: string; url: string; secret: string; events: string; active: number; fails: number; created_at: string; last_ok_at: string | null }>()
    .catch(() => null);
  return row ? { ...row, events: parseEvents(row.events) } : null;
}

/** Secret-gated read (never returns the secret itself). */
export async function getWebhookStatus(env: Env, id: string, secret: string): Promise<Omit<WebhookSub, "secret"> | null> {
  const s = await getSub(env, id);
  if (!s || s.secret !== secret) return null;
  const { secret: _s, ...rest } = s;
  return rest;
}

export async function deleteWebhook(env: Env, id: string, secret: string): Promise<boolean> {
  const s = await getSub(env, id);
  if (!s || s.secret !== secret) return false;
  await env.DB.prepare("DELETE FROM webhook_subs WHERE id=?").bind(id).run().catch(() => {});
  return true;
}

export async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Deliver = (url: string, init: RequestInit) => Promise<Response>;
const MAX_FAILS = 20;

/** POST the event to every active subscriber of it. `deliver` is injectable for tests. */
export async function fireWebhooks(env: Env, event: WebhookEvent, data: unknown, deliver: Deliver = fetch): Promise<number> {
  const { results } = await env.DB.prepare("SELECT * FROM webhook_subs WHERE active=1").all<{
    id: string; url: string; secret: string; events: string; fails: number;
  }>().catch(() => ({ results: [] as { id: string; url: string; secret: string; events: string; fails: number }[] }));
  const subs = results.filter((s) => parseEvents(s.events).includes(event));
  if (!subs.length) return 0;
  const body = JSON.stringify({ event, delivered_at: new Date().toISOString(), data });
  let ok = 0;
  await Promise.all(subs.map(async (s) => {
    const delivery = "dlv_" + hex(8);
    try {
      const res = await deliver(s.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-realufo-event": event,
          "x-realufo-delivery": delivery,
          "x-realufo-signature": await sign(s.secret, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ok++;
      await env.DB.prepare("UPDATE webhook_subs SET fails=0, last_ok_at=? WHERE id=?")
        .bind(new Date().toISOString(), s.id).run().catch(() => {});
    } catch (e) {
      const fails = s.fails + 1;
      await env.DB.prepare("UPDATE webhook_subs SET fails=?, active=? WHERE id=?")
        .bind(fails, fails >= MAX_FAILS ? 0 : 1, s.id).run().catch(() => {});
      console.error("webhook delivery failed", s.id, s.url, String(e).slice(0, 200));
    }
  }));
  return ok;
}

// New-record + new-release detection for the scheduled tick. Watermarks move
// before delivery (a crash mid-send never repeats), mirroring pushNewFiles.
export async function webhookTick(env: Env, deliver?: Deliver): Promise<void> {
  try {
    const newest = (await env.DB.prepare("SELECT max(created_at) m FROM records WHERE status='live'").first<{ m: string | null }>())?.m;
    if (newest) {
      const wm = await getState(env, "webhook_files").catch(() => null);
      if (!wm || newest > wm) {
        await setState(env, "webhook_files", newest).catch(() => {});
        if (wm) {
          const { results } = await env.DB.prepare(
            "SELECT id, archive FROM records WHERE status='live' AND created_at>? AND created_at<=? ORDER BY created_at DESC LIMIT 200"
          ).bind(wm, newest).all<{ id: string; archive: string }>().catch(() => ({ results: [] as { id: string; archive: string }[] }));
          if (results.length)
            await fireWebhooks(env, "records.created", {
              count: results.length,
              records: results.map((r) => ({ id: r.id, archive: r.archive, url: `https://realufo.org/doc/${encodeURIComponent(r.id)}` })),
            }, deliver);
        }
      }
    }
    const rels = await wargovReleases(env).catch(() => []);
    const maxNo = Math.max(0, ...rels.map((r) => r.no));
    if (maxNo > 0) {
      const wmNo = Number((await getState(env, "webhook_release").catch(() => null)) ?? 0);
      if (maxNo > wmNo) {
        await setState(env, "webhook_release", String(maxNo)).catch(() => {});
        for (const r of rels.filter((x) => x.no > wmNo).sort((a, b) => a.no - b.no))
          await fireWebhooks(env, "release.created", { no: r.no, date: r.date, file_count: r.raw.length }, deliver);
      }
    }
  } catch (e) {
    console.error("webhookTick failed", String(e).slice(0, 200));
  }
}
