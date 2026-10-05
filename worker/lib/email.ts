// Email alerts via Resend: sending helper + new-file digest cron.
// Free tier: 100 emails/day — digest caps at 100 recipients per tick.
import type { Env } from "../env";
import { getState, setState } from "./push";

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
export const emailOn = (env: Env) => !!env.RESEND_API_KEY;
const FROM = (env: Env) => env.EMAIL_FROM || "RealUFO <alerts@realufo.org>";

export async function sendEmail(env: Env, to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM(env), to: [to], subject, html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#07080c;color:#d7dce3;font-family:monospace,monospace"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="font-size:11px;letter-spacing:2px;color:#4df0a6">REALUFO.ORG</div><h1 style="font-size:18px;color:#fff">${title}</h1>${body}<hr style="border:none;border-top:1px solid #1c2027;margin:20px 0"><div style="font-size:11px;color:#6b7280">Declassified UAP archive · <a href="https://realufo.org" style="color:#4df0a6">realufo.org</a></div></div></body></html>`;
}

// Cron: email digest for records that went live since the last run.
// Mirrors pushNewFiles' watermark pattern.
export async function emailNewFiles(env: Env) {
  if (!emailOn(env)) return;
  const newest = (await env.DB.prepare("SELECT max(created_at) m FROM records WHERE status='live'").first<{ m: string | null }>())?.m;
  if (!newest) return;
  const wm = await getState(env, "email_new_files");
  if (wm && newest <= wm) return;
  await setState(env, "email_new_files", newest);
  if (!wm) return; // first run: no backlog flood
  const { results: recs } = await env.DB.prepare(
    `SELECT r.id, r.title, coalesce(a.label, r.archive) src FROM records r LEFT JOIN archives a ON a.id=r.archive
     WHERE r.status='live' AND r.created_at>? AND r.created_at<=? ORDER BY r.created_at DESC LIMIT 20`,
  ).bind(wm, newest).all<{ id: string; title: string; src: string }>();
  if (!recs.length) return;
  const { results: subs } = await env.DB.prepare(
    "SELECT email, token FROM email_subscribers WHERE status='confirmed' LIMIT 100",
  ).all<{ email: string; token: string }>();
  if (!subs.length) return;
  const one = recs.length === 1;
  const subject = one ? `New file: ${recs[0].id}` : `${recs.length} new files in the archive`;
  const items = recs.map((r) =>
    `<li style="margin:6px 0"><a href="https://realufo.org/doc/${encodeURIComponent(r.id)}" style="color:#4df0a6">${esc(r.id)}</a> <span style="color:#6b7280">· ${esc(r.src)}</span></li>`).join("");
  for (const s of subs) {
    const unsub = `https://realufo.org/api/email/unsubscribe?token=${s.token}`;
    await sendEmail(env, s.email, subject, shell(subject,
      `<ul style="font-size:14px;padding-left:18px">${items}</ul><p style="font-size:11px;color:#6b7280"><a href="${unsub}" style="color:#6b7280">unsubscribe</a></p>`));
  }
}
