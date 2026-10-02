import type { Env } from "../env";
import { thumbSql } from "./db";
import { uploadUrl } from "./upload";

export interface MetaInput {
  title: string;
  description: string;
  image?: string | null;
  url: string;
  type?: "website" | "article";
  // schema.org object; "@context", url and image are filled in by serveWithMeta.
  jsonLd?: Record<string, unknown>;
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
    // `<` escaped so user text can't close the script element.
    m.jsonLd && `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, "\\u003c")}</script>`,
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

// D1 "YYYY-MM-DD HH:MM:SS" (UTC) → ISO 8601.
const iso = (d: string | null) => (d ? d.replace(" ", "T") + "Z" : undefined);
const person = (handle: string | null) => ({ "@type": "Person", name: handle || "Anonymous" });
// Same as Doc.tsx's shortTitle: drop a leading "<ID>, " prefix.
const shortTitle = (t: string) => {
  const c = t.indexOf(",");
  return (c > 0 && c < 34 ? t.slice(c + 1).trim() : t).replace(/_/g, " ");
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
      `SELECT r.id,r.title,r.summary,r.agency,r.agency_full,r.incident_date,r.location,r.doc_date,${thumbSql("r.id")} thumb
       FROM records r WHERE r.id=?`
    )
      .bind(groups.id)
      .first<{
        id: string; title: string; summary: string | null; agency: string | null; agency_full: string | null;
        incident_date: string | null; location: string | null; doc_date: string | null; thumb: string | null;
      }>();
    if (!x) return null;
    // No summary → build one from the record's facts rather than an empty description.
    const facts = [x.agency_full || x.agency, x.incident_date, x.location].filter(Boolean).join(" · ");
    const description = x.summary || (facts ? `Declassified UAP record — ${facts}.` : "");
    // Matches the SPA's tab title (Doc.tsx): "<short title> — UAP file <id>".
    const title = `${shortTitle(x.title)} — UAP file ${x.id}`;
    const agency = x.agency_full || x.agency;
    return {
      title, description, image: x.thumb, url: "",
      jsonLd: {
        "@type": "DigitalDocument", name: title, identifier: x.id, description,
        dateCreated: x.doc_date || undefined, contentLocation: x.location || undefined,
        publisher: agency ? { "@type": "GovernmentOrganization", name: agency } : undefined,
      },
    };
  }
  if (kind === "board") {
    // URL slug is bare ("uap"), the column is slash-wrapped ("/uap/").
    const x = await env.DB.prepare("SELECT name,desc FROM boards WHERE slug=?")
      .bind(`/${groups.slug}/`)
      .first<{ name: string; desc: string | null }>();
    if (!x) return null;
    return {
      title: x.name, description: x.desc || "", url: "", type: "website",
      jsonLd: { "@type": "CollectionPage", name: x.name, description: x.desc || undefined },
    };
  }
  if (kind === "case") {
    const x = await env.DB.prepare("SELECT name,lede FROM cases WHERE slug=?")
      .bind(groups.slug)
      .first<{ name: string; lede: string | null }>();
    if (!x) return null;
    const description = (x.lede || "").slice(0, 200);
    return { title: x.name, description, url: "", jsonLd: { "@type": "Article", headline: x.name, description } };
  }
  const x = await env.DB.prepare(
    `SELECT t.title,t.op_body,t.op_handle,t.reply_count,t.created_at,${thumbSql("t.source_record_id")} thumb FROM threads t WHERE t.id=?`
  )
    .bind(groups.id)
    .first<{ title: string; op_body: string | null; op_handle: string | null; reply_count: number; created_at: string | null; thumb: string | null }>();
  if (!x) return null;
  // ponytail: first 50 replies only; page the JSON-LD if threads get huge.
  const { results: posts } = await env.DB.prepare(
    "SELECT body,handle,image_r2_key,is_op,created_at FROM posts WHERE thread_id=? ORDER BY is_op DESC, created_at ASC LIMIT 51"
  )
    .bind(groups.id)
    .all<{ body: string; handle: string | null; image_r2_key: string | null; is_op: number; created_at: string | null }>();
  const op = posts.find((p) => p.is_op);
  const replies = posts.filter((p) => !p.is_op);
  return {
    title: x.title,
    description: (x.op_body || "").slice(0, 200),
    image: uploadUrl(env, op?.image_r2_key ?? null) || x.thumb,
    url: "",
    jsonLd: {
      "@type": "DiscussionForumPosting",
      headline: x.title,
      text: x.op_body || "",
      author: person(x.op_handle),
      datePublished: iso(x.created_at),
      commentCount: x.reply_count,
      comment: replies.map((p) => ({ "@type": "Comment", text: p.body, author: person(p.handle), datePublished: iso(p.created_at) })),
    },
  };
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
      let body = html;
      if (meta) {
        const image = meta.image || shareCard(url);
        const jsonLd = meta.jsonLd && { "@context": "https://schema.org", ...meta.jsonLd, url: url.href, image };
        body = injectMeta(html, { ...meta, image, url: url.href, jsonLd });
      }
      return new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });
    }
  }
  return env.ASSETS.fetch(req);
}
