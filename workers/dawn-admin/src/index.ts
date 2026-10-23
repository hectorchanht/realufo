/**
 * Dawn Studio Admin — private admin portal (Worker + D1).
 * Magic-link login (allowlist only), manual license-key CRUD, Gumroad sales view.
 * Serves both workers.dev root and dawnstudio.app/admin* (path prefix stripped).
 */

export interface Env {
  DB: D1Database;
  ANALYTICS_DB?: D1Database;
  ACCOUNTS_DB?: D1Database;
  RESEND_API_KEY?: string;
  MAGIC_LINK_FROM?: string;
}

const ALLOWLIST = new Set(['f147259@gmail.com']);
const SESSION_COOKIE = '__ds_admin';
const SESSION_TTL_S = 30 * 24 * 3600;
const MAGIC_TTL_MS = 15 * 60 * 1000;
const MAGIC_RATE_PER_HOUR = 5;

// The six Dawn Studio apps + their Gumroad tip-jar permalinks.
const APPS = [
  { id: 'moneyrate', name: 'MoneyRate', desc: 'Cross-border money toolkit', tip: 'moneyrate-tip', pro: true },
  { id: 'openmusic', name: 'OpenMusic', desc: 'Music player', tip: 'openmusic-tip' },
  { id: 'clipbin', name: 'ClipBin', desc: 'Clipboard manager', tip: 'clipbin-tip' },
  { id: 'holdr', name: 'Holdr', desc: 'Portfolio tracker', tip: 'holdr-tip' },
  { id: 'openq', name: 'OpenQ', desc: 'Quiz app', tip: 'openq-tip' },
  { id: 'pennyvest', name: 'Pennyvest', desc: 'Investment education', tip: 'pennyvest-tip' },
] as const;

// ---------- crypto / helpers ----------

async function sha256hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCookie(req: Request, name: string): string | null {
  const h = req.headers.get('Cookie') || '';
  for (const part of h.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function html(body: string, status = 200): Response {
  return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dawn Studio Admin</title><style>${CSS}</style></head><body>${body}</body></html>`, {
    status, headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------- session ----------

async function getSessionEmail(req: Request, env: Env): Promise<string | null> {
  const tok = getCookie(req, SESSION_COOKIE);
  if (!tok) return null;
  const hash = await sha256hex('session:' + tok);
  const row = await env.DB.prepare('SELECT email, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first<{ email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.email;
}

async function createSession(env: Env, email: string): Promise<string> {
  const tok = randomToken(32);
  const hash = await sha256hex('session:' + tok);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(hash, email, now + SESSION_TTL_S * 1000, now).run();
  return tok;
}

function sessionCookie(tok: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(tok)}; Path=/; Max-Age=${SESSION_TTL_S}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

// ---------- rate limit (D1-backed) ----------

async function rateLimit(env: Env, key: string, max: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first<{ count: number; window_start: number }>();
  if (!row || now - row.window_start > windowMs) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)').bind(key, now).run();
    return true;
  }
  if (row.count >= max) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

// ---------- email (Resend) ----------

async function sendMagicLinkEmail(env: Env, to: string, link: string): Promise<void> {
  const from = env.MAGIC_LINK_FROM || 'Dawn Studio <login@dawnstudio.app>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to,
      subject: 'Your Dawn Studio Admin login link',
      html: `<p>Click the link below to log in to the Dawn Studio admin portal. It expires in 15 minutes and can only be used once.</p><p><a href="${link}">Log in to Dawn Studio Admin</a></p><p>If you didn't request this, just ignore this email.</p>`,
      text: `Log in to Dawn Studio Admin (expires in 15 minutes, single use): ${link}`,
    }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}`);
}

// ---------- key generation ----------

function genLicenseKey(): string {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(12));
  const grp = (o: number) => [...b.slice(o, o + 4)].map((x) => alpha[x % alpha.length]).join('');
  return `DS-${grp(0)}-${grp(4)}-${grp(8)}`;
}

// ---------- Gumroad (server-side, Bearer) ----------

async function gumroadFetch(env: Env, path: string, init?: RequestInit): Promise<any> {
  const s = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gumroad_token'").first<{ value: string }>();
  if (!s?.value) throw new Error('not_connected');
  const res = await fetch(`https://api.gumroad.com/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${s.value}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || `Gumroad HTTP ${res.status}`);
  return data;
}

// ---------- handlers ----------

async function handleMagicLink(req: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);

  const ip = clientIp(req);
  if (!(await rateLimit(env, `ml:ip:${ip}`, MAGIC_RATE_PER_HOUR, 3600_000))) {
    return json({ error: 'Too many requests — try again later.' }, 429);
  }

  // No enumeration: always respond ok. Only the allowlisted email gets a real link.
  if (!ALLOWLIST.has(email)) return json({ ok: true });

  if (!env.RESEND_API_KEY) return json({ error: 'Email sending is not configured yet.' }, 500);

  const token = randomToken(32);
  const tokenHash = await sha256hex('magic:' + token);
  await env.DB.prepare('INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, email, Date.now() + MAGIC_TTL_MS).run();

  const url = new URL(req.url);
  const base = url.origin + (url.pathname.startsWith('/admin') ? '/admin' : '');
  const link = `${base}/api/verify?token=${token}`;
  try {
    await sendMagicLinkEmail(env, email, link);
  } catch {
    await env.DB.prepare('DELETE FROM magic_tokens WHERE token_hash = ?').bind(tokenHash).run();
    return json({ error: 'Could not send the email. Try again later.' }, 500);
  }
  return json({ ok: true });
}

async function handleVerify(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const base = url.pathname.startsWith('/admin') ? '/admin' : '';
  if (!token) return html(LOGIN_HTML.replace('<!--MSG-->', '<p class="err">Missing token.</p>'), 400);
  const tokenHash = await sha256hex('magic:' + token);
  const row = await env.DB.prepare('SELECT email, expires_at, used_at FROM magic_tokens WHERE token_hash = ?').bind(tokenHash).first<{ email: string; expires_at: number; used_at: number | null }>();
  if (!row || row.used_at || row.expires_at < Date.now() || !ALLOWLIST.has(row.email)) {
    return html(LOGIN_HTML.replace('<!--MSG-->', '<p class="err">This link is invalid or expired.</p>'), 400);
  }
  await env.DB.prepare('UPDATE magic_tokens SET used_at = ? WHERE token_hash = ?').bind(Date.now(), tokenHash).run();
  const sess = await createSession(env, row.email);
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/`, 'Set-Cookie': sessionCookie(sess) },
  });
}

async function handleLogout(req: Request, env: Env): Promise<Response> {
  const tok = getCookie(req, SESSION_COOKIE);
  const url = new URL(req.url);
  const base = url.pathname.startsWith('/admin') ? '/admin' : '';
  if (tok) {
    const hash = await sha256hex('session:' + tok);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  }
  return new Response(null, { status: 302, headers: { Location: `${base}/login`, 'Set-Cookie': clearCookie() } });
}

// ---------- main ----------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname;
    if (path.startsWith('/admin')) path = path.slice(6) || '/';
    const base = new URL(req.url).pathname.startsWith('/admin') ? '/admin' : '';
    const method = req.method;

    // Public auth endpoints
    if (path === '/login' && method === 'GET') return html(LOGIN_HTML.replace('<!--MSG-->', ''));
    if (path === '/api/magic-link' && method === 'POST') return handleMagicLink(req, env);
    if (path === '/api/verify' && method === 'GET') return handleVerify(req, env);

    // Session gate
    const email = await getSessionEmail(req, env);
    const isApi = path.startsWith('/api/');
    if (!email) {
      if (isApi) return json({ error: 'Unauthorized.' }, 401);
      return new Response(null, { status: 302, headers: { Location: `${base}/login` } });
    }

    // Pages
    if ((path === '/' || path === '') && method === 'GET') return html(dashboardHTML(base, email));
    if (path === '/analytics' && method === 'GET') return html(analyticsHTML(base, email));
    if (path === '/api/analytics/summary' && method === 'GET') return handleAnalyticsSummary(env);
    if (path === '/api/logout' && method === 'POST') return handleLogout(req, env);
    if (path === '/api/me' && method === 'GET') return json({ email });

    // Apps overview
    if (path === '/api/apps' && method === 'GET') {
      let gum: any = { connected: false };
      try {
        const data = await gumroadFetch(env, '/products');
        const products: any[] = data.products || [];
        gum = {
          connected: true,
          apps: APPS.map((a) => {
            const p = products.find((x) => String(x.permalink || '').endsWith(a.tip) || String(x.custom_permalink || '').endsWith(a.tip));
            return { id: a.id, name: a.name, desc: a.desc, product: p ? { id: p.id, name: p.name, price: p.price_cents } : null };
          }),
        };
      } catch (e: any) {
        if (e.message !== 'not_connected') gum = { connected: false, error: String(e.message || e).slice(0, 120) };
      }
      return json({ apps: APPS, gumroad: gum });
    }

    // Manual keys CRUD
    if (path === '/api/keys' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, key, label, app, status, notes, created_at FROM manual_keys ORDER BY created_at DESC').all();
      return json({ keys: rows.results });
    }
    if (path === '/api/keys' && method === 'POST') {
      let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const id = randomToken(12);
      const key = genLicenseKey();
      const app = String(body.app || '').trim();
      if (app && !(APPS as readonly { id: string }[]).some((a) => a.id === app)) return json({ error: 'Unknown app.' }, 400);
      await env.DB.prepare('INSERT INTO manual_keys (id, key, label, app, status, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, key, String(body.label || '').slice(0, 120), app || null, 'active', String(body.notes || '').slice(0, 500), Date.now()).run();
      return json({ ok: true, id, key });
    }
    const keyMatch = path.match(/^\/api\/keys\/([A-Za-z0-9_-]+)$/);
    if (keyMatch && (method === 'PATCH' || method === 'DELETE')) {
      const id = keyMatch[1];
      if (method === 'DELETE') {
        await env.DB.prepare('DELETE FROM manual_keys WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
      let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const status = String(body.status || '');
      if (!['active', 'revoked'].includes(status)) return json({ error: 'status must be active or revoked.' }, 400);
      await env.DB.prepare('UPDATE manual_keys SET status = ?, label = COALESCE(?, label), notes = COALESCE(?, notes) WHERE id = ?')
        .bind(status, body.label !== undefined ? String(body.label).slice(0, 120) : null, body.notes !== undefined ? String(body.notes).slice(0, 500) : null, id).run();
      return json({ ok: true });
    }

    // Gumroad settings
    if (path === '/api/gumroad/status' && method === 'GET') {
      const s = await env.DB.prepare("SELECT value FROM settings WHERE key = 'gumroad_token'").first<{ value: string }>();
      return json({ connected: !!s?.value });
    }
    if (path === '/api/gumroad/token' && method === 'POST') {
      let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const token = String(body.token || '').trim();
      if (!token) return json({ error: 'Token required.' }, 400);
      // Validate before storing (never log the value)
      try { await gumroadFetchRaw(token, '/products'); }
      catch { return json({ error: 'Token invalid — Gumroad rejected it.' }, 400); }
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('gumroad_token', ?, ?)").bind(token, Date.now()).run();
      return json({ ok: true });
    }
    if (path === '/api/gumroad/token' && method === 'DELETE') {
      await env.DB.prepare("DELETE FROM settings WHERE key = 'gumroad_token'").run();
      return json({ ok: true });
    }
    if (path === '/api/gumroad/products' && method === 'GET') {
      try { return json(await gumroadFetch(env, '/products')); }
      catch (e: any) { return json({ error: e.message === 'not_connected' ? 'Gumroad not connected.' : String(e.message).slice(0, 200) }, e.message === 'not_connected' ? 409 : 502); }
    }
    if (path === '/api/gumroad/sales' && method === 'GET') {
      const productId = url.searchParams.get('product_id') || '';
      const pageKey = url.searchParams.get('page_key') || '';
      try {
        let p = `/sales?${productId ? `product_id=${encodeURIComponent(productId)}&` : ''}${pageKey ? `page_key=${encodeURIComponent(pageKey)}` : ''}`;
        return json(await gumroadFetch(env, p));
      } catch (e: any) { return json({ error: e.message === 'not_connected' ? 'Gumroad not connected.' : String(e.message).slice(0, 200) }, e.message === 'not_connected' ? 409 : 502); }
    }
    if (path === '/api/gumroad/refund' && method === 'POST') {
      let body: any; try { body = await req.json(); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const saleId = String(body.sale_id || '').trim();
      if (!saleId) return json({ error: 'sale_id required.' }, 400);
      try { return json(await gumroadFetch(env, `/sales/${encodeURIComponent(saleId)}/refund`, { method: 'PUT' })); }
      catch (e: any) { return json({ error: e.message === 'not_connected' ? 'Gumroad not connected.' : String(e.message).slice(0, 200) }, e.message === 'not_connected' ? 409 : 502); }
    }

    return isApi ? json({ error: 'Not found.' }, 404) : new Response(null, { status: 302, headers: { Location: `${base}/login` } });
  },
};

async function gumroadFetchRaw(token: string, path: string): Promise<any> {
  const res = await fetch(`https://api.gumroad.com/v2${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error('rejected');
  return data;
}

// ---------- OpenMusic analytics (D1 play_events) ----------

async function handleAnalyticsSummary(env: Env): Promise<Response> {
  const adb = env.ANALYTICS_DB;
  if (!adb) return json({ error: 'Analytics database is not bound.' }, 500);
  try {
    const days = await adb.prepare(
      `SELECT substr(played_at,1,10) AS day, COUNT(*) AS plays, COUNT(DISTINCT anon_id) AS users
       FROM play_events WHERE played_at >= date('now','-30 days') GROUP BY day ORDER BY day`
    ).all();
    const totals = await adb.prepare(
      `SELECT COUNT(*) AS plays, COUNT(DISTINCT anon_id) AS users FROM play_events`
    ).first();
    const totals30 = await adb.prepare(
      `SELECT COUNT(*) AS plays, COUNT(DISTINCT anon_id) AS users FROM play_events WHERE played_at >= date('now','-30 days')`
    ).first();
    const topSongs = await adb.prepare(
      `SELECT title, artist, source, COUNT(*) AS plays, COUNT(DISTINCT anon_id) AS users
       FROM play_events GROUP BY song_id, title, artist, source ORDER BY plays DESC LIMIT 20`
    ).all();
    const bySource = await adb.prepare(
      `SELECT source, COUNT(*) AS plays FROM play_events GROUP BY source ORDER BY plays DESC`
    ).all();
    const byCountry = await adb.prepare(
      `SELECT country, COUNT(*) AS plays, COUNT(DISTINCT anon_id) AS users FROM play_events GROUP BY country ORDER BY plays DESC LIMIT 20`
    ).all();
    const byPlatform = await adb.prepare(
      `SELECT platform, COUNT(*) AS plays FROM play_events GROUP BY platform ORDER BY plays DESC`
    ).all();
    const byDevice = await adb.prepare(
      `SELECT device_type, COUNT(*) AS plays FROM play_events GROUP BY device_type ORDER BY plays DESC`
    ).all();
    // ---------- likes & downloads (quick-261023-like-dl) ----------
    // PII-side openmusic-accounts DB (tables like_events, download_events), deliberately
    // NOT the no-PII openmusic-analytics above. Degrades to null when the binding is
    // absent (older deploy) — the page renders the plays section anyway.
    let likes = null;
    const cdb = env.ACCOUNTS_DB;
    if (cdb) {
      const likeDays = await cdb.prepare(
        `SELECT substr(liked_at,1,10) AS day,
           SUM(CASE WHEN action='like' THEN 1 ELSE 0 END) AS likes,
           SUM(CASE WHEN action='unlike' THEN 1 ELSE 0 END) AS unlikes,
           COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT anon_id) AS devices
         FROM like_events WHERE liked_at >= date('now','-30 days') GROUP BY day ORDER BY day`
      ).all();
      const dlDays = await cdb.prepare(
        `SELECT substr(downloaded_at,1,10) AS day, COUNT(*) AS downloads,
           COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT anon_id) AS devices,
           COALESCE(SUM(bytes),0) AS bytes
         FROM download_events WHERE downloaded_at >= date('now','-30 days') GROUP BY day ORDER BY day`
      ).all();
      const likeTotals = await cdb.prepare(
        `SELECT SUM(CASE WHEN action='like' THEN 1 ELSE 0 END) AS likes,
           SUM(CASE WHEN action='unlike' THEN 1 ELSE 0 END) AS unlikes,
           COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT anon_id) AS devices FROM like_events`
      ).first();
      const dlTotals = await cdb.prepare(
        `SELECT COUNT(*) AS downloads, COUNT(DISTINCT user_id) AS users,
           COUNT(DISTINCT anon_id) AS devices, COALESCE(SUM(bytes),0) AS bytes FROM download_events`
      ).first();
      const topLiked = await cdb.prepare(
        `SELECT title, artist, source, COUNT(*) AS likes
         FROM like_events WHERE action='like' GROUP BY song_id, title, artist, source ORDER BY likes DESC LIMIT 20`
      ).all();
      const topDownloaded = await cdb.prepare(
        `SELECT title, artist, source, COUNT(*) AS downloads, COALESCE(SUM(bytes),0) AS bytes
         FROM download_events GROUP BY song_id, title, artist, source ORDER BY downloads DESC LIMIT 20`
      ).all();
      // Emails via JOIN users — shown only on this private, session-gated page (Hector-only).
      const topLikeUsers = await cdb.prepare(
        `SELECT u.email AS email, COUNT(*) AS likes
         FROM like_events e JOIN users u ON u.id = e.user_id
         WHERE e.action='like' GROUP BY u.email ORDER BY likes DESC LIMIT 20`
      ).all();
      const topDlUsers = await cdb.prepare(
        `SELECT u.email AS email, COUNT(*) AS downloads, COALESCE(SUM(e.bytes),0) AS bytes
         FROM download_events e JOIN users u ON u.id = e.user_id
         GROUP BY u.email ORDER BY downloads DESC LIMIT 20`
      ).all();
      likes = {
        likeDays: likeDays.results, dlDays: dlDays.results,
        likeTotals, dlTotals,
        topLiked: topLiked.results, topDownloaded: topDownloaded.results,
        topLikeUsers: topLikeUsers.results, topDlUsers: topDlUsers.results,
      };
    }
    return json({
      days: days.results, totals, totals30,
      topSongs: topSongs.results, bySource: bySource.results,
      byCountry: byCountry.results, byPlatform: byPlatform.results, byDevice: byDevice.results,
      likes,
    });
  } catch (e: any) {
    return json({ error: 'Analytics query failed: ' + String(e?.message || e).slice(0, 200) }, 500);
  }
}

// ---------- UI ----------

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b0d10;color:#e8eaed;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;min-height:100vh}
a{color:#7aa2ff}
.wrap{max-width:1080px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #22262c;margin-bottom:24px}
header h1{font-size:20px;font-weight:700}
header .who{font-size:13px;color:#9aa0a6;margin-right:12px}
.btn{background:#1f6feb;border:0;color:#fff;padding:9px 16px;border-radius:8px;font-size:14px;cursor:pointer}
.btn:hover{background:#388bfd}
.btn.ghost{background:#21262d;color:#e8eaed;border:1px solid #30363d}
.btn.danger{background:#5a1f1f;border:1px solid #8c3a3a}
.btn:disabled{opacity:.5;cursor:default}
.card{background:#111418;border:1px solid #22262c;border-radius:12px;padding:18px;margin-bottom:18px}
.card h2{font-size:16px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.app{padding:14px}
.app h3{font-size:15px;margin-bottom:4px}
.app p{font-size:13px;color:#9aa0a6;margin-bottom:8px}
.pill{display:inline-block;font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid #30363d;color:#9aa0a6}
.pill.ok{color:#3fb950;border-color:#2a5a35}
.pill.warn{color:#d29922;border-color:#6b5416}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #1c2026;vertical-align:top}
th{color:#9aa0a6;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
code.key{font-family:ui-monospace,Menlo,monospace;background:#0d1117;padding:3px 8px;border-radius:6px;border:1px solid #30363d;font-size:12.5px;white-space:nowrap}
input,select,textarea{background:#0d1117;border:1px solid #30363d;color:#e8eaed;border-radius:8px;padding:9px 12px;font-size:14px;width:100%}
textarea{resize:vertical;min-height:56px}
label{font-size:13px;color:#9aa0a6;display:block;margin:10px 0 5px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
.row>div{flex:1;min-width:140px}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{width:100%;max-width:400px}
.login-card h1{font-size:22px;margin-bottom:6px}
.login-card p.sub{color:#9aa0a6;font-size:14px;margin-bottom:18px}
.msg{margin-top:12px;font-size:14px}
.msg.ok{color:#3fb950}.msg.err{color:#f85149}
.hidden{display:none}
.note{font-size:13px;color:#9aa0a6;margin-top:8px}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#9aa0a6;word-break:break-all}
.toolbar{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}
.toolbar input{max-width:280px}
@media(max-width:640px){.row>div{min-width:100%}}
`;

const LOGIN_HTML = `
<div class="login-wrap"><div class="card login-card">
<h1>Dawn Studio Admin</h1>
<p class="sub">Private admin portal. Sign in with a magic link.</p>
<form id="f"><label for="email">Email</label><input id="email" type="email" required autocomplete="email" placeholder="you@example.com"><div style="margin-top:14px"><button class="btn" type="submit" style="width:100%">Send login link</button></div></form>
<div id="msg" class="msg"></div><!--MSG-->
</div></div>
<script>
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = document.getElementById('msg');
  m.className = 'msg'; m.textContent = 'Sending…';
  try {
    const r = await fetch('api/magic-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: document.getElementById('email').value }) });
    const d = await r.json();
    if (!r.ok) { m.className = 'msg err'; m.textContent = d.error || 'Failed.'; return; }
    m.className = 'msg ok'; m.textContent = "If this email is registered, you'll receive a login link shortly.";
  } catch { m.className = 'msg err'; m.textContent = 'Network error.'; }
});
</script>`;

function dashboardHTML(base: string, email: string): string {
  return `
<div class="wrap">
<header><h1>Dawn Studio Admin</h1><div><span class="who">${email}</span><a class="btn ghost" href="${base}/analytics" style="text-decoration:none;margin-right:8px">Analytics</a><button class="btn ghost" id="logout">Log out</button></div></header>

<div class="card"><h2>Apps — paying status</h2><div id="apps" class="grid"><p class="note">Loading…</p></div></div>

<div class="card"><h2>Manual license keys</h2>
<div class="toolbar"><input id="q" placeholder="Search label / key / app…"><button class="btn" id="newKey">New key</button></div>
<div id="newForm" class="hidden" style="margin-bottom:14px;border:1px solid #30363d;border-radius:8px;padding:14px">
<div class="row"><div><label>Label</label><input id="nkLabel" placeholder="e.g. Gift for friend"></div>
<div><label>App</label><select id="nkApp"><option value="">Any</option>${APPS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}</select></div></div>
<label>Notes</label><textarea id="nkNotes" placeholder="Optional notes"></textarea>
<div style="margin-top:10px;display:flex;gap:10px"><button class="btn" id="createKey">Create key</button><button class="btn ghost" id="cancelNew">Cancel</button></div>
<div id="newMsg" class="msg"></div></div>
<table><thead><tr><th>Key</th><th>Label</th><th>App</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody id="keys"><tr><td colspan="6" class="note">Loading…</td></tr></tbody></table>
</div>

<div class="card"><h2>Gumroad</h2><div id="gum"></div></div>
</div>
<script>
const B = ${JSON.stringify(base)};
const api = (p, o) => fetch(B + p, { credentials: 'same-origin', ...(o || {}) });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ALL_KEYS = [];
document.getElementById('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = B + '/login'; };

async function loadApps() {
  const el = document.getElementById('apps');
  try {
    const d = await (await api('/api/apps')).json();
    const g = d.gumroad || {};
    el.innerHTML = d.apps.map((a) => {
      const ga = (g.apps || []).find((x) => x.id === a.id);
      const st = !g.connected ? '<span class="pill warn">Gumroad disconnected</span>'
        : ga && ga.product ? '<span class="pill ok">live</span>' : '<span class="pill">no product matched</span>';
      return '<div class="card app"><h3>' + esc(a.name) + '</h3><p>' + esc(a.desc) + '</p><div>' + st + '</div>' +
        (ga && ga.product ? '<p class="mono" style="margin-top:8px">' + esc(ga.product.name) + '</p>' : '') + '</div>';
    }).join('');
  } catch { el.innerHTML = '<p class="err">Failed to load.</p>'; }
}

function renderKeys() {
  const q = (document.getElementById('q').value || '').toLowerCase();
  const rows = ALL_KEYS.filter((k) => !q || (k.label + ' ' + k.key + ' ' + (k.app || '')).toLowerCase().includes(q));
  document.getElementById('keys').innerHTML = rows.length ? rows.map((k) =>
    '<tr><td><code class="key">' + esc(k.key) + '</code></td><td>' + esc(k.label || '—') + '</td><td>' + esc(k.app || 'Any') + '</td>' +
    '<td><span class="pill ' + (k.status === 'active' ? 'ok' : '') + '">' + esc(k.status) + '</span></td><td>' + esc(k.notes || '—') + '</td>' +
    '<td style="white-space:nowrap"><button class="btn ghost" data-act="toggle" data-id="' + k.id + '" data-st="' + k.status + '">' + (k.status === 'active' ? 'Revoke' : 'Activate') + '</button> ' +
    '<button class="btn danger" data-act="del" data-id="' + k.id + '">Delete</button></td></tr>').join('')
    : '<tr><td colspan="6" class="note">No keys yet.</td></tr>';
  document.querySelectorAll('#keys button').forEach((b) => b.onclick = async () => {
    const id = b.dataset.id;
    if (b.dataset.act === 'del' && !confirm('Delete this key permanently?')) return;
    const st = b.dataset.act === 'toggle' ? (b.dataset.st === 'active' ? 'revoked' : 'active') : null;
    await api('/api/keys/' + id, { method: st ? 'PATCH' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: st ? JSON.stringify({ status: st }) : undefined });
    loadKeys();
  });
}
async function loadKeys() {
  try { ALL_KEYS = (await (await api('/api/keys')).json()).keys || []; } catch { ALL_KEYS = []; }
  renderKeys();
}
document.getElementById('q').oninput = renderKeys;
document.getElementById('newKey').onclick = () => document.getElementById('newForm').classList.toggle('hidden');
document.getElementById('cancelNew').onclick = () => document.getElementById('newForm').classList.add('hidden');
document.getElementById('createKey').onclick = async () => {
  const m = document.getElementById('newMsg'); m.className = 'msg'; m.textContent = 'Creating…';
  const r = await api('/api/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: document.getElementById('nkLabel').value, app: document.getElementById('nkApp').value, notes: document.getElementById('nkNotes').value }) });
  const d = await r.json();
  if (!r.ok) { m.className = 'msg err'; m.textContent = d.error || 'Failed.'; return; }
  m.className = 'msg ok'; m.innerHTML = 'Created: <code class="key">' + esc(d.key) + '</code>';
  document.getElementById('nkLabel').value = ''; document.getElementById('nkNotes').value = '';
  loadKeys();
};

async function loadGum() {
  const el = document.getElementById('gum');
  let st = { connected: false };
  try { st = await (await api('/api/gumroad/status')).json(); } catch {}
  if (!st.connected) {
    el.innerHTML = '<p><span class="pill warn">disconnected</span></p><p class="note">Paste your Gumroad API token to see products and sales. It is stored server-side and never shown again.</p>' +
      '<div class="row" style="margin-top:10px"><div><label>API token</label><input id="gt" type="password" placeholder="Gumroad API token"></div></div>' +
      '<div style="margin-top:10px"><button class="btn" id="gConnect">Connect</button></div><div id="gMsg" class="msg"></div>';
    document.getElementById('gConnect').onclick = async () => {
      const m = document.getElementById('gMsg'); m.className = 'msg'; m.textContent = 'Connecting…';
      const r = await api('/api/gumroad/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: document.getElementById('gt').value }) });
      const d = await r.json();
      if (!r.ok) { m.className = 'msg err'; m.textContent = d.error || 'Failed.'; return; }
      loadGum(); loadApps();
    };
    return;
  }
  el.innerHTML = '<p><span class="pill ok">connected</span> <button class="btn ghost" id="gDisc" style="margin-left:8px">Disconnect</button></p><div id="gprods" style="margin-top:12px"><p class="note">Loading products…</p></div>';
  document.getElementById('gDisc').onclick = async () => { if (confirm('Disconnect Gumroad?')) { await api('/api/gumroad/token', { method: 'DELETE' }); loadGum(); loadApps(); } };
  try {
    const d = await (await api('/api/gumroad/products')).json();
    const prods = d.products || [];
    document.getElementById('gprods').innerHTML = prods.length ? '<table><thead><tr><th>Product</th><th>Price</th><th></th></tr></thead><tbody>' +
      prods.map((p) => '<tr><td>' + esc(p.name) + '<br><span class="mono">' + esc(p.permalink || p.id) + '</span></td><td>' + esc(fmtPrice(p)) + '</td>' +
      '<td><button class="btn ghost" data-p="' + esc(p.id) + '">Sales</button></td></tr>').join('') + '</tbody></table><div id="gsales" style="margin-top:12px"></div>'
      : '<p class="note">No products found.</p>';
    document.querySelectorAll('#gprods button[data-p]').forEach((b) => b.onclick = () => loadSales(b.dataset.p));
  } catch (e) { document.getElementById('gprods').innerHTML = '<p class="err">Failed to load products.</p>'; }
}
function fmtPrice(p) {
  if (p.price_cents != null && p.currency) return (p.price_cents / 100).toFixed(2) + ' ' + String(p.currency).toUpperCase();
  return p.formatted_price || '—';
}
async function loadSales(pid) {
  const el = document.getElementById('gsales');
  el.innerHTML = '<p class="note">Loading sales…</p>';
  try {
    const d = await (await api('/api/gumroad/sales?product_id=' + encodeURIComponent(pid))).json();
    const sales = d.sales || [];
    el.innerHTML = sales.length ? '<table><thead><tr><th>Sale</th><th>Email</th><th>Amount</th><th>Date</th><th></th></tr></thead><tbody>' +
      sales.map((s) => '<tr><td class="mono">' + esc(s.id) + '</td><td>' + esc(s.email || '—') + '</td><td>' + esc(s.price_cents != null ? (s.price_cents / 100).toFixed(2) : '—') + '</td><td>' + esc(s.created_at || '') + '</td>' +
      '<td>' + (s.refunded ? '<span class="pill">refunded</span>' : '<button class="btn danger" data-s="' + esc(s.id) + '">Refund</button>') + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="note">No sales for this product yet.</p>';
    el.querySelectorAll('button[data-s]').forEach((b) => b.onclick = async () => {
      if (!confirm('Refund this sale? This revokes the purchase.')) return;
      const r = await api('/api/gumroad/refund', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sale_id: b.dataset.s }) });
      const dd = await r.json();
      if (!r.ok) alert(dd.error || 'Refund failed.'); else loadSales(pid);
    });
  } catch { el.innerHTML = '<p class="err">Failed to load sales.</p>'; }
}
loadApps(); loadKeys(); loadGum();
</script>`;

}

function analyticsHTML(base: string, email: string): string {
  return `
<div class="wrap">
<header><h1><a href="${base}/" style="color:#e8eaed;text-decoration:none">Dawn Studio Admin</a></h1><div><span class="who">${email}</span><button class="btn ghost" id="logout">Log out</button></div></header>

<div class="card"><h2>OpenMusic — usage analytics</h2><div id="stats" class="grid"><p class="note">Loading…</p></div>
<p class="note">Distinct users counts anonymous browser IDs (one per browser). It resets if a user clears site data, so treat it as an approximation, not an exact headcount.</p></div>

<div class="card"><h2>Plays per day — last 30 days</h2><div id="chart"><p class="note">Loading…</p></div></div>

<div class="card"><h2>Top songs</h2><div id="topsongs"><p class="note">Loading…</p></div></div>

<div class="grid">
<div class="card"><h2>By source</h2><div id="bysource"><p class="note">Loading…</p></div></div>
<div class="card"><h2>By country</h2><div id="bycountry"><p class="note">Loading…</p></div></div>
<div class="card"><h2>By platform</h2><div id="byplatform"><p class="note">Loading…</p></div></div>
<div class="card"><h2>By device</h2><div id="bydevice"><p class="note">Loading…</p></div></div>
</div>

<div class="card"><h2>Likes & downloads</h2><div id="stats2" class="grid"><p class="note">Loading…</p></div>
<p class="note">Signed-in users are identified by account (emails below — this page is private). Logged-out events count anonymous device IDs, the same approximation as plays.</p></div>

<div class="card"><h2>Likes / downloads per day — last 30 days</h2><div id="chart2"><p class="note">Loading…</p></div></div>

<div class="card"><h2>Top liked songs</h2><div id="topliked"><p class="note">Loading…</p></div></div>

<div class="card"><h2>Top downloaded songs</h2><div id="topdl"><p class="note">Loading…</p></div></div>

<div class="grid">
<div class="card"><h2>Top users by likes</h2><div id="topusers"><p class="note">Loading…</p></div></div>
<div class="card"><h2>Top users by downloads</h2><div id="topdlusers"><p class="note">Loading…</p></div></div>
</div>
</div>
<script>
const B = ${JSON.stringify(base)};
const api = (p, o) => fetch(B + p, { credentials: 'same-origin', ...(o || {}) });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
document.getElementById('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = B + '/login'; };

function statCard(label, val) {
  return '<div class="card app"><h3 style="font-size:28px">' + (val ?? 0) + '</h3><p>' + esc(label) + '</p></div>';
}
function kvTable(rows, k, v) {
  rows = rows || [];
  if (!rows.length) return '<p class="note">No data yet.</p>';
  return '<table><tbody>' + rows.map((x) => '<tr><td>' + esc(x[k] || '—') + '</td><td style="text-align:right">' + x[v] + '</td></tr>').join('') + '</tbody></table>';
}
function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}
async function load() {
  let d;
  try { d = await (await api('/api/analytics/summary')).json(); }
  catch { document.getElementById('stats').innerHTML = '<p class="err">Failed to load.</p>'; return; }
  if (!d || d.error) { document.getElementById('stats').innerHTML = '<p class="err">' + esc((d && d.error) || 'Failed to load.') + '</p>'; return; }
  const t = d.totals || {}, t30 = d.totals30 || {};
  document.getElementById('stats').innerHTML =
    statCard('Total plays', t.plays) + statCard('Distinct users', t.users) +
    statCard('Plays (30 days)', t30.plays) + statCard('Users (30 days)', t30.users);
  const days = d.days || [];
  const max = Math.max(1, ...days.map((x) => x.plays));
  document.getElementById('chart').innerHTML = days.length ? days.map((x) =>
    '<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px">' +
    '<span style="width:48px;color:#9aa0a6">' + esc(String(x.day).slice(5)) + '</span>' +
    '<div style="flex:1;background:#0d1117;border-radius:4px;height:14px"><div style="height:100%;width:' +
    Math.max(2, Math.round((x.plays / max) * 100)) + '%;background:#1f6feb;border-radius:4px"></div></div>' +
    '<span style="width:110px;text-align:right;white-space:nowrap">' + x.plays + ' plays · ' + x.users + ' users</span></div>').join('')
    : '<p class="note">No plays yet.</p>';
  const ts = d.topSongs || [];
  document.getElementById('topsongs').innerHTML = ts.length ?
    '<table><thead><tr><th>Song</th><th>Artist</th><th>Source</th><th>Plays</th><th>Users</th></tr></thead><tbody>' +
    ts.map((x) => '<tr><td>' + esc(x.title || x.song_id || '—') + '</td><td>' + esc(x.artist || '—') + '</td><td>' + esc(x.source || '—') +
    '</td><td>' + x.plays + '</td><td>' + x.users + '</td></tr>').join('') + '</tbody></table>'
    : '<p class="note">No plays yet.</p>';
  document.getElementById('bysource').innerHTML = kvTable(d.bySource, 'source', 'plays');
  document.getElementById('bycountry').innerHTML = kvTable(d.byCountry, 'country', 'plays');
  document.getElementById('byplatform').innerHTML = kvTable(d.byPlatform, 'platform', 'plays');
  document.getElementById('bydevice').innerHTML = kvTable(d.byDevice, 'device_type', 'plays');
  const L = d.likes;
  if (!L) {
    document.getElementById('stats2').innerHTML = '<p class="note">Accounts DB not bound on this deploy.</p>';
    document.getElementById('chart2').innerHTML = '<p class="note">Accounts DB not bound on this deploy.</p>';
  } else {
    const lt = L.likeTotals || {}, dt = L.dlTotals || {};
    document.getElementById('stats2').innerHTML =
      statCard('Total likes', lt.likes) + statCard('Total unlikes', lt.unlikes) +
      statCard('Total downloads', dt.downloads) + statCard('Downloaded bytes', fmtBytes(dt.bytes)) +
      statCard('Likers (signed-in)', lt.users) + statCard('Downloaders (signed-in)', dt.users);
    const merged = {};
    (L.likeDays || []).forEach((x) => { merged[x.day] = merged[x.day] || {}; merged[x.day].likes = x.likes; });
    (L.dlDays || []).forEach((x) => { merged[x.day] = merged[x.day] || {}; merged[x.day].downloads = x.downloads; });
    const days2 = Object.keys(merged).sort();
    const max2 = Math.max(1, ...days2.map((k) => Math.max(merged[k].likes || 0, merged[k].downloads || 0)));
    document.getElementById('chart2').innerHTML = days2.length ? days2.map((k) => {
      const m = merged[k];
      const lw = Math.max(2, Math.round(((m.likes || 0) / max2) * 100));
      const dw = Math.max(2, Math.round(((m.downloads || 0) / max2) * 100));
      return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0;font-size:12px">' +
        '<span style="width:48px;color:#9aa0a6">' + esc(String(k).slice(5)) + '</span>' +
        '<div style="flex:1;background:#0d1117;border-radius:4px;height:14px">' +
        '<div style="height:50%;width:' + lw + '%;background:#3fb950;border-radius:4px 4px 0 0"></div>' +
        '<div style="height:50%;width:' + dw + '%;background:#1f6feb;border-radius:0 0 4px 4px"></div></div>' +
        '<span style="width:170px;text-align:right;white-space:nowrap">' + (m.likes || 0) + ' likes · ' + (m.downloads || 0) + ' downloads</span></div>';
    }).join('') : '<p class="note">No likes or downloads yet.</p>';
    const tl = L.topLiked || [];
    document.getElementById('topliked').innerHTML = tl.length ?
      '<table><thead><tr><th>Song</th><th>Artist</th><th>Source</th><th>Likes</th></tr></thead><tbody>' +
      tl.map((x) => '<tr><td>' + esc(x.title || '—') + '</td><td>' + esc(x.artist || '—') + '</td><td>' + esc(x.source || '—') +
      '</td><td>' + x.likes + '</td></tr>').join('') + '</tbody></table>' : '<p class="note">No likes yet.</p>';
    const td = L.topDownloaded || [];
    document.getElementById('topdl').innerHTML = td.length ?
      '<table><thead><tr><th>Song</th><th>Artist</th><th>Source</th><th>Downloads</th><th>Bytes</th></tr></thead><tbody>' +
      td.map((x) => '<tr><td>' + esc(x.title || '—') + '</td><td>' + esc(x.artist || '—') + '</td><td>' + esc(x.source || '—') +
      '</td><td>' + x.downloads + '</td><td>' + fmtBytes(x.bytes) + '</td></tr>').join('') + '</tbody></table>' : '<p class="note">No downloads yet.</p>';
    const tu = L.topLikeUsers || [];
    document.getElementById('topusers').innerHTML = tu.length ?
      '<table><tbody>' + tu.map((x) => '<tr><td>' + esc(x.email || '—') + '</td><td style="text-align:right">' + x.likes + ' likes</td></tr>').join('') + '</tbody></table>'
      : '<p class="note">No signed-in likes yet.</p>';
    const tdu = L.topDlUsers || [];
    document.getElementById('topdlusers').innerHTML = tdu.length ?
      '<table><tbody>' + tdu.map((x) => '<tr><td>' + esc(x.email || '—') + '</td><td style="text-align:right">' + x.downloads + ' · ' + fmtBytes(x.bytes) + '</td></tr>').join('') + '</tbody></table>'
      : '<p class="note">No signed-in downloads yet.</p>';
  }
}
load();
</script>`;
}
