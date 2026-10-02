import type { Env } from "../env";
import { esc, injectBody, DEFAULT_DESCRIPTION } from "./ssr";
import { ROUTES, type Page } from "./pages";
import { cachedJson } from "./cache";
import { decodedGroups } from "../router";

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
  // e.g. "noindex" for pages whose content (AI answers) must not be indexed.
  robots?: string;
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
// Search snippets show ~160 chars; user text can carry newlines.
export function snippet(text: string, max = 160): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : cut.length) + "…";
}

export function injectMeta(html: string, m: MetaInput): string {
  const t = esc(m.title);
  const d = esc(snippet(m.description || DEFAULT_DESCRIPTION));
  const u = esc(m.url);
  const img = m.image ? esc(m.image) : "";
  const tags = [
    `<title>${t} · RealUFO</title>`,
    `<meta name="description" content="${d}">`,
    `<link rel="canonical" href="${u}">`,
    m.robots && `<meta name="robots" content="${esc(m.robots)}">`,
    `<meta property="og:site_name" content="RealUFO">`,
    `<meta property="og:type" content="${m.type ?? "article"}">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    img && `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:site" content="@realufoorg">`,
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
const htmlResponse = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html;charset=utf-8" } });

// Real 404 status (no soft-404s in search); the SPA still boots and shows its own not-found screen.
const notFound = (html: string, url: URL) =>
  htmlResponse(
    injectMeta(html, { title: "Page not found", description: DEFAULT_DESCRIPTION, url: url.origin + url.pathname, type: "website", robots: "noindex" }),
    404
  );

const PAGE_TTL = 3600;

// Caches the loaded page data (meta + body JSON) per path, so D1 runs at most
// once per path per colo per hour. Data, not HTML: the current index.html is
// re-read every request, so a deploy's new bundle hash is never stale.
// Pathname-only key so query strings can't bust it; misses aren't cached.
// ponytail: crawlers may see up to 1h-old related lists / replies; humans get
// fresh data from the SPA's API calls. Purge or shorten PAGE_TTL if that matters.
async function cachedPage(url: URL, load: () => Promise<Page | null>): Promise<Page | null> {
  return cachedJson(`${url.origin}/__page${url.pathname}`, load, PAGE_TTL);
}

const shell = async (env: Env, url: URL) => (await env.ASSETS.fetch(new Request(new URL("/index.html", url)))).text();

// GET on a pre-rendered SPA route (lib/pages.ts ROUTES) → the built index.html
// with per-route <head> meta and a plain-HTML body in #root, whatever the
// Accept header (share scrapers often send */*). Entity not found, or a path
// that is neither a route nor a file (the assets SPA fallback answers those
// with index.html) → 404 + noindex. D1 error → plain shell, 200. Everything
// else goes straight to env.ASSETS.
export async function serveWithMeta(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "GET") {
    // "/archive/" and "/archive" would otherwise be two URLs for one page.
    if (url.pathname.length > 1 && url.pathname.endsWith("/"))
      return Response.redirect(url.origin + url.pathname.replace(/\/+$/, "") + url.search, 301);
    for (const r of ROUTES) {
      const match = r.pattern.exec({ pathname: url.pathname });
      const params = match && decodedGroups(match);
      if (!params) continue;
      const html = await shell(env, url);
      let page: Page | null = null;
      try {
        page = await cachedPage(url, () => r.load(env, params, url));
      } catch (e) {
        // D1 trouble must not take the SPA shell down; the SPA shows its own errors.
        console.error("pre-render failed", url.pathname, e);
        return htmlResponse(html);
      }
      if (!page) return notFound(html, url);
      // Query strings (archive filters, fbclid) never make a separate canonical page.
      const canonical = url.origin + url.pathname;
      const image = page.meta.image || shareCard(url);
      const jsonLd = page.meta.jsonLd && { "@context": "https://schema.org", ...page.meta.jsonLd, url: canonical, image };
      return htmlResponse(injectBody(injectMeta(html, { ...page.meta, image, url: canonical, jsonLd }), page.body, page.footer));
    }
    const res = await env.ASSETS.fetch(req);
    if (url.pathname !== "/index.html" && res.headers.get("content-type")?.startsWith("text/html")) return notFound(await res.text(), url);
    return res;
  }
  return env.ASSETS.fetch(req);
}
