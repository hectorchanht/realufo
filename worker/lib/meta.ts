import type { Env } from "../env";

export interface MetaInput {
  title: string;
  description: string;
  image?: string | null;
  url: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Replaces the `<!--META-->` placeholder in `html` with per-route <title> +
// description + OpenGraph/Twitter tags. All interpolated values are
// HTML-escaped. If the placeholder isn't present, html is returned unchanged.
export function injectMeta(html: string, m: MetaInput): string {
  const t = esc(m.title);
  const d = esc(m.description || "");
  const u = esc(m.url);
  const img = m.image ? esc(m.image) : "";
  const tags = [
    `<title>${t} · RealUFO</title>`,
    `<meta name="description" content="${d}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    img && `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
  ]
    .filter(Boolean)
    .join("\n");
  return html.replace("<!--META-->", tags);
}

const META_ROUTES = [
  { pattern: new URLPattern({ pathname: "/doc/:id" }), kind: "doc" as const },
  { pattern: new URLPattern({ pathname: "/case/:slug" }), kind: "case" as const },
  { pattern: new URLPattern({ pathname: "/thread/:id" }), kind: "thread" as const },
];

async function lookupMeta(env: Env, kind: "doc" | "case" | "thread", groups: Record<string, string>): Promise<MetaInput | null> {
  if (kind === "doc") {
    const x = await env.DB.prepare(
      `SELECT r.title,r.summary,(SELECT cdn_url FROM assets a WHERE a.record_id=r.id AND a.role='thumb' LIMIT 1) thumb
       FROM records r WHERE r.id=?`
    )
      .bind(groups.id)
      .first<{ title: string; summary: string | null; thumb: string | null }>();
    if (!x) return null;
    return { title: x.title, description: x.summary || "", image: x.thumb, url: "" };
  }
  if (kind === "case") {
    const x = await env.DB.prepare("SELECT name,lede FROM cases WHERE slug=?")
      .bind(groups.slug)
      .first<{ name: string; lede: string | null }>();
    if (!x) return null;
    return { title: x.name, description: (x.lede || "").slice(0, 200), url: "" };
  }
  const x = await env.DB.prepare("SELECT title,op_body FROM threads WHERE id=?")
    .bind(groups.id)
    .first<{ title: string; op_body: string | null }>();
  if (!x) return null;
  return { title: x.title, description: (x.op_body || "").slice(0, 200), url: "" };
}

// For GET requests that accept text/html and match one of the deep-link
// routes (/doc/:id, /case/:slug, /thread/:id), fetches the built SPA's
// index.html via the ASSETS binding, looks up the entity in D1, and injects
// per-route <meta>/OpenGraph tags. Falls back to the unmodified index.html
// (default meta) when the entity isn't found, and passes every other request
// straight through to env.ASSETS.fetch(req).
export async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  if (req.method === "GET" && accept.includes("text/html")) {
    for (const r of META_ROUTES) {
      const match = r.pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      const groups = match.pathname.groups as Record<string, string>;
      const idxRes = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
      const html = await idxRes.text();
      const meta = await lookupMeta(env, r.kind, groups);
      const body = meta ? injectMeta(html, { ...meta, url: url.href }) : html;
      return new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
  }
  return env.ASSETS.fetch(req);
}
