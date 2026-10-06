// Embeddable "latest release" badge for external sites.
// <iframe src="https://realufo.org/embed/badge" width="320" height="96"
//   style="border:0" loading="lazy" title="Latest RealUFO release"></iframe>
// ?theme=light for light pages. Edge-cached 1h; links back to /releases.
import type { Env } from "../env";
import { wargovReleases } from "../lib/facets";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function badge(_req: Request, env: Env) {
  const rels = await wargovReleases(env).catch(() => []);
  const latest = rels[rels.length - 1];
  const theme = new URL(_req.url).searchParams.get("theme") === "light" ? "light" : "dark";
  const dark = theme === "dark";
  const no = latest ? String(latest.no).padStart(2, "0") : "–";
  const count = latest ? latest.raw.length : 0;
  const date = latest?.date ?? "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0}
body{font-family:ui-monospace,Menlo,Consolas,monospace;background:${dark ? "#0b0e14" : "#ffffff"};color:${dark ? "#e6e9f0" : "#111318"}}
a{display:flex;flex-direction:column;justify-content:center;gap:2px;height:96px;padding:12px 16px;text-decoration:none;color:inherit;border:1px solid ${dark ? "#232838" : "#e2e5ec"};border-radius:12px}
.k{font-size:10px;letter-spacing:1.5px;color:${dark ? "#8b93a7" : "#6b7280"}}
.t{font-size:15px;font-weight:700}
.t b{color:#ff5c38}
.s{font-size:11px;color:${dark ? "#8b93a7" : "#6b7280"}}
</style></head><body>
<a href="https://realufo.org/releases" target="_blank" rel="noopener">
<span class="k">REALUFO · DECLASSIFIED UAP ARCHIVE</span>
<span class="t">Latest release <b>${esc(no)}</b></span>
<span class="s">${count ? `${count} files · ${esc(date)}` : "—"}</span>
</a></body></html>`;
  return new Response(html, {
    // No X-Frame-Options on purpose: framing is the point of the badge.
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=3600" },
  });
}
