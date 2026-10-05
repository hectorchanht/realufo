// Email alert HTTP endpoints (double opt-in).
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { allowWrite } from "../lib/ratelimit";
import { sendEmail, shell, esc, EMAIL_RE, emailOn } from "../lib/email";

// POST /api/email/subscribe {email} → sends the confirm email.
export async function emailSubscribe(req: Request, env: Env) {
  if (!emailOn(env)) return error(503, "email off");
  if (!(await allowWrite(env, req, "email"))) return error(429, "slow down");
  let b: any;
  try { b = await req.json(); } catch { b = {}; }
  const email = String(b?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return error(400, "bad email");
  const token = crypto.randomUUID().replace(/-/g, "");
  const existing = await env.DB.prepare("SELECT status FROM email_subscribers WHERE email=?").bind(email).first<{ status: string }>();
  if (existing?.status === "confirmed") return json({ ok: true, already: true });
  if (existing) {
    await env.DB.prepare("UPDATE email_subscribers SET token=?, status='pending', created_at=datetime('now') WHERE email=?").bind(token, email).run();
  } else {
    await env.DB.prepare("INSERT INTO email_subscribers (email, status, token) VALUES (?, 'pending', ?)").bind(email, token).run();
  }
  const url = `https://realufo.org/api/email/confirm?token=${token}`;
  const ok = await sendEmail(env, email, "Confirm your RealUFO alerts",
    shell("One more click", `<p style="font-size:14px">Click to confirm email alerts for new declassified files:</p><p><a href="${url}" style="display:inline-block;background:#4df0a6;color:#07080c;padding:10px 20px;text-decoration:none;font-weight:bold">CONFIRM ALERTS</a></p><p style="font-size:12px;color:#6b7280">Or paste: ${esc(url)}</p>`));
  return json({ ok, sent: ok });
}

// GET /api/email/confirm?token= → confirms, shows a page.
export async function emailConfirm(req: Request, env: Env) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const row = await env.DB.prepare("SELECT email, status FROM email_subscribers WHERE token=?").bind(token).first<{ email: string; status: string }>();
  let title = "Link expired", msg = "This confirmation link is invalid. Try subscribing again.";
  if (row) {
    if (row.status !== "confirmed") {
      await env.DB.prepare("UPDATE email_subscribers SET status='confirmed', confirmed_at=datetime('now') WHERE token=?").bind(token).run();
    }
    title = "Alerts on";
    msg = `Done — <b>${esc(row.email)}</b> will get an email whenever new files land in the archive.`;
  }
  return new Response(shell(title, `<p style="font-size:14px">${msg}</p><p><a href="https://realufo.org" style="color:#4df0a6">← back to the archive</a></p>`),
    { headers: { "content-type": "text/html; charset=utf-8" } });
}

// GET /api/email/unsubscribe?token= → one-click unsubscribe.
export async function emailUnsubscribe(req: Request, env: Env) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const row = await env.DB.prepare("SELECT email FROM email_subscribers WHERE token=?").bind(token).first<{ email: string }>();
  if (row) {
    await env.DB.prepare("UPDATE email_subscribers SET status='unsubscribed', unsubscribed_at=datetime('now') WHERE token=?").bind(token).run();
  }
  return new Response(shell("Unsubscribed", `<p style="font-size:14px">${row ? `No more alerts for <b>${esc(row.email)}</b>.` : "This link is invalid."}</p><p><a href="https://realufo.org" style="color:#4df0a6">← back to the archive</a></p>`),
    { headers: { "content-type": "text/html; charset=utf-8" } });
}
