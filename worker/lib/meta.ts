import type { Env } from "../env";
import { thumbSql } from "./db";

export interface MetaInput {
  title: string;
  description: string;
  image?: string | null;
  url: string;
  type?: "website" | "article";
}

// Same copy as the default block in web/index.html.
export const DEFAULT_DESCRIPTION =
  "Searchable archive of declassified UAP/UFO records from the Pentagon, CIA, FBI and NASA, with case files, a sighting map and anonymous discussion boards.";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Replaces the `<!--META-->…<!--/META-->` default block (or a bare
// `<!--META-->` placeholder) in `html` with per-route <title> +
// description + OpenGraph/Twitter tags. All interpolated values are
// HTML-escaped. Also strips any pre-existing static `<title>` (e.g. the
// `<title>web</title>` in web/index.html) so the injected title is the only
// one left — per the HTML spec, the FIRST <title> in document order wins for
// document.title, so leaving the static one in place would silently shadow
// the per-entity title we inject. If the placeholder isn't present, html is
// returned unchanged (aside from that title strip).
export function injectMeta(html: string, m: MetaInput): string {
  const t = esc(m.title);
  const d = esc(m.description || DEFAULT_DESCRIPTION);
  const u = esc(m.url);
  const img = m.image ? esc(m.image) : "";
  const tags = [
    `<title>${t} · RealUFO</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    `<meta property="og:site_name" content="RealUFO">`,
    `<meta property="og:type" content="${m.type ?? "article"}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    img && `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
  ]
    .filter(Boolean)
    .join("\n");
  const withoutStaticTitle = html.replace(/<title>.*?<\/title>/is, "");
  return withoutStaticTitle.replace(/<!--META-->(?:[\s\S]*?<!--\/META-->)?/, tags);
}

// Tab screens: fixed copy, no D1 lookup. "/" keeps index.html's defaults.
const STATIC_META: Record<string, Omit<MetaInput, "url">> = {
  "/archive": {
    title: "The Archive",
    description: "Browse and search every declassified UAP record — PDFs, images and video from AARO, the Pentagon, CIA, FBI and NASA.",
    type: "website",
  },
  "/boards": {
    title: "The Boards",
    description: "Anonymous discussion boards for UAP sightings, declassified files and cold cases.",
    type: "website",
  },
  "/map": {
    title: "Sighting Map",
    description: "Map of where the declassified UAP files come from.",
    type: "website",
  },
};

type Kind = "doc" | "case" | "thread" | "board";
const META_ROUTES = [
  { pattern: new URLPattern({ pathname: "/doc/:id" }), kind: "doc" as const },
  { pattern: new URLPattern({ pathname: "/case/:slug" }), kind: "case" as const },
  { pattern: new URLPattern({ pathname: "/thread/:id" }), kind: "thread" as const },
  { pattern: new URLPattern({ pathname: "/board/:slug" }), kind: "board" as const },
];

async function lookupMeta(env: Env, kind: Kind, groups: Record<string, string>): Promise<MetaInput | null> {
  if (kind === "doc") {
    const x = await env.DB.prepare(
      `SELECT r.title,r.summary,r.agency,r.agency_full,r.incident_date,r.location,${thumbSql("r.id")} thumb
       FROM records r WHERE r.id=?`
    )
      .bind(groups.id)
      .first<{
        title: string; summary: string | null; agency: string | null; agency_full: string | null;
        incident_date: string | null; location: string | null; thumb: string | null;
      }>();
    if (!x) return null;
    // No summary → build one from the record's facts rather than an empty description.
    const facts = [x.agency_full || x.agency, x.incident_date, x.location].filter(Boolean).join(" · ");
    const description = x.summary || (facts ? `Declassified UAP record — ${facts}.` : "");
    return { title: x.title.replace(/_/g, " "), description, image: x.thumb, url: "" };
  }
  if (kind === "board") {
    // URL slug is bare ("uap"), the column is slash-wrapped ("/uap/").
    const x = await env.DB.prepare("SELECT name,desc FROM boards WHERE slug=?")
      .bind(`/${groups.slug}/`)
      .first<{ name: string; desc: string | null }>();
    if (!x) return null;
    return { title: x.name, description: x.desc || "", url: "", type: "website" };
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

// Site share card (web/public/og.png) for pages without their own thumb.
const shareCard = (url: URL) => new URL("/og.png", url).href;

// For GET requests that accept text/html and match a tab screen
// (STATIC_META) or a deep-link route (/doc/:id, /case/:slug, /thread/:id,
// /board/:slug), fetches the built SPA's
// index.html via the ASSETS binding, looks up the entity in D1, and injects
// per-route <meta>/OpenGraph tags. Falls back to the unmodified index.html
// (its default meta block) when the entity isn't found, and passes every other request
// straight through to env.ASSETS.fetch(req).
export async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";
  if (req.method === "GET" && accept.includes("text/html")) {
    const fixed = STATIC_META[url.pathname];
    if (fixed) {
      const html = await (await env.ASSETS.fetch(new Request(new URL("/index.html", url)))).text();
      return new Response(injectMeta(html, { ...fixed, image: shareCard(url), url: url.href }), { headers: { "content-type": "text/html;charset=utf-8" } });
    }
    for (const r of META_ROUTES) {
      const match = r.pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      const groups = match.pathname.groups as Record<string, string>;
      const idxRes = await env.ASSETS.fetch(new Request(new URL("/index.html", url)));
      const html = await idxRes.text();
      const meta = await lookupMeta(env, r.kind, groups);
      const body = meta ? injectMeta(html, { ...meta, image: meta.image || shareCard(url), url: url.href }) : html;
      return new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
  }
  return env.ASSETS.fetch(req);
}
