import type { Env } from "../env";
import { esc, injectBody, DEFAULT_DESCRIPTION } from "./ssr";
import { ROUTES, type Page } from "./pages";

export { DEFAULT_DESCRIPTION };

export interface MetaInput {
  title: string;
  description: string;
  image?: string | null;
  url: string;
  type?: "website" | "article";
  // schema.org object; "@context", url and image are filled in by serveWithMeta.
  jsonLd?: Record<string, unknown>;
  // Emitted as a BreadcrumbList; hrefs are resolved against url.
  breadcrumbs?: { name: string; href: string }[];
}

// `<` escaped so user text can't close the script element.
const ldScript = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

// Replaces the `<!--META-->…<!--/META-->` default block (or a bare
// `<!--META-->` placeholder) in `html` with per-route <title> +
// description + OpenGraph/Twitter tags + JSON-LD. All interpolated values are
// HTML-escaped. Also strips any pre-existing static `<title>` so the injected
// title is the only one left (the FIRST <title> wins for document.title). If
// the placeholder isn't present, html is returned unchanged (aside from that
// title strip).
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
    m.jsonLd && ldScript(m.jsonLd),
    m.breadcrumbs &&
      ldScript({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: m.breadcrumbs.map((b, i) => ({
          "@type": "ListItem", position: i + 1, name: b.name, item: new URL(b.href, m.url).href,
        })),
      }),
  ]
    .filter(Boolean)
    .join("\n");
  const withoutStaticTitle = html.replace(/<title>.*?<\/title>/is, "");
  // Function replacement: a string replacement would expand `$&`/`$'` in titles.
  return withoutStaticTitle.replace(/<!--META-->(?:[\s\S]*?<!--\/META-->)?/, () => tags);
}

// Site share card (web/public/og.png) for pages without their own image.
const shareCard = (url: URL) => new URL("/og.png", url).href;
const htmlResponse = (body: string) => new Response(body, { headers: { "content-type": "text/html;charset=utf-8" } });

const PAGE_TTL = 3600;

// Caches the loaded page data (meta + body JSON) per path, so D1 runs at most
// once per path per colo per hour. Data, not HTML: the current index.html is
// re-read every request, so a deploy's new bundle hash is never stale.
// Pathname-only key so query strings can't bust it; misses aren't cached.
// ponytail: crawlers may see up to 1h-old related lists / replies; humans get
// fresh data from the SPA's API calls. Purge or shorten PAGE_TTL if that matters.
async function cachedPage(url: URL, load: () => Promise<Page | null>): Promise<Page | null> {
  const key = new Request(`${url.origin}/__page${url.pathname}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json<Page>();
  const page = await load();
  if (page)
    await caches.default.put(
      key,
      new Response(JSON.stringify(page), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${PAGE_TTL}` },
      })
    );
  return page;
}

// GET on a pre-rendered SPA route (lib/pages.ts ROUTES) → the built index.html
// with per-route <head> meta and a plain-HTML body in #root, whatever the
// Accept header (share scrapers often send */*). Entity not found → index.html
// untouched. Every other request goes straight to env.ASSETS.
export async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    for (const r of ROUTES) {
      const match = r.pattern.exec({ pathname: url.pathname });
      if (!match) continue;
      const html = await (await env.ASSETS.fetch(new Request(new URL("/index.html", url)))).text();
      const page = await cachedPage(url, () => r.load(env, match.pathname.groups as Record<string, string>, url));
      if (!page) return htmlResponse(html);
      const image = page.meta.image || shareCard(url);
      const jsonLd = page.meta.jsonLd && { "@context": "https://schema.org", ...page.meta.jsonLd, url: url.href, image };
      return htmlResponse(injectBody(injectMeta(html, { ...page.meta, image, url: url.href, jsonLd }), page.body));
    }
  }
  return env.ASSETS.fetch(req);
}
