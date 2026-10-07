// Reply notifications via email (Resend). A poster opts in by supplying an
// email in the thread composer ("email me when someone replies"); each direct
// quote-reply (>>No) to one of their posts sends one email. One-click
// unsubscribe per (post, email) via a token, handled by the same
// /api/email/unsubscribe endpoint as the newsletter.
//
// Every DB touch tolerates the reply_subs table being absent (migration 0047
// not yet applied in D1) — the feature is quietly off until then.
import type { Env } from "../env";
import { sendEmail, shell, esc, EMAIL_RE, emailOn } from "./email";
import { getState, setState } from "./push";
import { newId } from "./anon";

// Resend free tier: 100 emails/day, shared with the new-file digest cron.
const DAILY_CAP = 80;
const MAX_QUOTES = 10;
const SNIPPET_LEN = 220;

/** Distinct post nos quoted via `>>12345678` in a body. */
export function parseQuoteNos(body: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of body.matchAll(/>>(\d+)/g)) {
    const n = Number(m[1]);
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
    if (out.length >= MAX_QUOTES) break;
  }
  return out;
}

/** Normalized email, or null when absent/invalid. */
export function validNotifyEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

/** Subscribe a post's author to reply notifications. Re-subscribing with the
 *  same email keeps the original token (INSERT OR IGNORE). */
export async function subscribeReply(env: Env, postId: string, email: string): Promise<void> {
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO reply_subs(id, post_id, email, token) VALUES(?,?,?,?)")
      .bind(newId(), postId, email, crypto.randomUUID().replace(/-/g, ""))
      .run();
  } catch {
    // reply_subs missing (migration 0047 not applied) — feature off.
  }
}

type QuotedPost = { id: string; no: number; actor_id: string | null };

export async function notifyQuoted(
  env: Env,
  threadId: string,
  threadTitle: string,
  reply: { no: number; body: string; actor_id: string | null; notifyEmail: string | null },
): Promise<void> {
  if (!emailOn(env)) return;
  const nos = parseQuoteNos(reply.body);
  if (!nos.length) return;
  let quoted: QuotedPost[];
  try {
    const r = await env.DB.prepare(
      `SELECT id, no, actor_id FROM posts WHERE thread_id=? AND no IN (${nos.map(() => "?").join(",")})`,
    )
      .bind(threadId, ...nos)
      .all<QuotedPost>();
    quoted = r.results ?? [];
  } catch {
    return; // reply_subs missing — feature off.
  }
  for (const q of quoted) {
    // Quoting your own post from the same browser: no notification.
    if (q.actor_id && reply.actor_id && q.actor_id === reply.actor_id) continue;
    let subs: { email: string; token: string }[];
    try {
      const r = await env.DB.prepare("SELECT email, token FROM reply_subs WHERE post_id=?")
        .bind(q.id)
        .all<{ email: string; token: string }>();
      subs = r.results ?? [];
    } catch {
      continue;
    }
    for (const s of subs) {
      // The replier's own subscription (same email they just posted with).
      if (reply.notifyEmail && s.email === reply.notifyEmail) continue;
      await sendReplyEmail(env, s.email, s.token, threadId, threadTitle, q.no, reply.no, reply.body);
    }
  }
}

async function dailyCount(env: Env): Promise<number> {
  try {
    return Number(await getState(env, `reply_notify:${new Date().toISOString().slice(0, 10)}`)) || 0;
  } catch {
    return 0;
  }
}

async function sendReplyEmail(
  env: Env,
  to: string,
  token: string,
  threadId: string,
  threadTitle: string,
  quotedNo: number,
  replyNo: number,
  replyBody: string,
): Promise<void> {
  if ((await dailyCount(env)) >= DAILY_CAP) return;
  const url = `https://realufo.org/thread/${encodeURIComponent(threadId)}#p${replyNo}`;
  const unsub = `https://realufo.org/api/email/unsubscribe?token=${token}`;
  const snippet = replyBody.length > SNIPPET_LEN ? replyBody.slice(0, SNIPPET_LEN - 1).trimEnd() + "…" : replyBody;
  const ok = await sendEmail(
    env,
    to,
    "Someone replied to your post on RealUFO",
    shell(
      "You got a reply",
      `<p style="font-size:14px">Someone quoted your post <b>No.${quotedNo}</b> in <b>${esc(threadTitle)}</b>:</p>` +
        `<p style="font-size:14px;border-left:2px solid #4df0a6;padding-left:10px;color:#d7dce3">${esc(snippet)}</p>` +
        `<p><a href="${url}" style="display:inline-block;background:#4df0a6;color:#07080c;padding:10px 20px;text-decoration:none;font-weight:bold">VIEW REPLY</a></p>` +
        `<p style="font-size:12px;color:#6b7280">Or paste: ${esc(url)}</p>` +
        `<p style="font-size:11px;color:#6b7280"><a href="${unsub}" style="color:#6b7280">Stop reply notifications for this post</a></p>`,
    ),
  );
  if (ok) {
    try {
      await setState(env, `reply_notify:${new Date().toISOString().slice(0, 10)}`, String((await dailyCount(env)) + 1));
    } catch {
      // counter best-effort; the email already went out.
    }
  }
}
