// Site-wide footer under every screen, three tiers: brand + social icons;
// the archive's ways in (tabs, hub pages, resources/machine-readable files),
// always one scroll away instead of buried in page content (same hub list as
// /browse); then contact, legal and appearance as the small print.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import type { HubKind } from "../api/types";
import { useNavItems } from "./navItems";
import { useLang } from "../lib/lang";
import { useFooterLinks } from "../lib/footerLinks";
import { AppearanceSwitcher } from "./AppearanceSwitcher";
// (LangToggle unmounted: site is English-only for now — see lib/lang.tsx)
import { Saucer } from "./Saucer";
import { DATASET_URL, SOCIAL_PROFILES } from "../../../worker/lib/profiles";

const GROUPS: [HubKind, "footer.topics" | "footer.releases" | "footer.agencies" | "footer.decades"][] = [["release", "footer.releases"], ["agency", "footer.agencies"], ["decade", "footer.decades"], ["topic", "footer.topics"]];
// Plain <a>: served by the Worker, not SPA routes.
const FILES = [
  ["llms.txt", "/llms.txt"],
  ["llms-full.txt", "/llms-full.txt"],
  ["sitemap.xml", "/sitemap.xml"],
  ["RSS feed", "/rss.xml"],
  ["Open dataset", DATASET_URL],
];

// Brand marks (simple-icons, CC0), 24×24 paths keyed by SOCIAL_PROFILES name.
const ICONS: Record<string, string> = {
  X: "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
  Bluesky: "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026",
  Facebook: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
  Instagram: "M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077",
  Threads: "M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z",
  GitHub: "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  YouTube: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  "Ko-fi": "M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298",
};

// All footer links share the "Request a file 🛸" hover: underline on hover.
const linkCls = "text-dim hover:text-ink hover:underline";
const headCls = "mb-2 font-semibold tracking-[.5px] text-ink";

export default function SiteFooter() {
  const hubs = useHubs().data?.hubs ?? [];
  const { tabs, more } = useNavItems();
  const { t } = useLang();
  const page = useFooterLinks();
  // Each column sizes to its own content (never squeezed to a fixed grid
  // track): wide columns keep long labels on one line, narrow ones like
  // Decades stay narrow. Whole columns wrap to the next row when space runs
  // out; max-w-full caps them on very small screens so nothing overflows.
  const col = (title: string, items: ReactNode[]) => (
    <div key={title} className="max-w-full">
      <h2 className={headCls}>{title}</h2>
      <ul className="space-y-1">{items}</ul>
    </div>
  );
  return (
    <footer data-site-footer className="mt-12 border-t border-line pt-6 font-mono text-[11px]">
      {/* Brand + social: who this is and where else to find it. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/" className="flex items-center gap-[11px]">
            <Saucer />
            <span className="font-pixel text-[11px] text-ink">REAL<span className="text-signal">UFO</span></span>
          </Link>
          <p className="mt-2 text-faint">{t("footer.tagline")}</p>
        </div>
        <ul aria-label="Follow RealUFO" className="flex flex-wrap gap-4">
          {/* GitHub is a personal account's repo, not a RealUFO profile: no rel=me / sameAs. */}
          {[...SOCIAL_PROFILES.map(([n, u]) => [n, u, n, "noopener me"]), ["GitHub", "https://github.com/hectorchanht/realufo", "Source code on GitHub", "noopener"]].map(([name, url, label, rel]) => (
            <li key={name}>
              <a className={`${linkCls} block`} href={url} target="_blank" rel={rel} aria-label={label} title={label}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d={ICONS[name]} /></svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <nav aria-label="Site" className="flex flex-wrap gap-x-8 gap-y-6 sm:gap-x-10">
        {col(t("footer.explore"), [
          ...[...tabs, ...more].map((i) => (
            <li key={i.path}><Link className={linkCls} to={i.path}>{i.label}</Link></li>
          )),
          // Record comparison tool (not a nav tab, but a site feature).
          <li key="compare"><Link className={linkCls} to="/compare">{t("footer.compare")}</Link></li>,
          // WTF leaderboard (not a nav tab, but a site feature).
          <li key="leaderboard"><Link className={linkCls} to="/leaderboard">{t("footer.leaderboard")}</Link></li>,
        ])}
        {GROUPS.map(([kind, key]) => {
          const group = hubs.filter((h) => h.kind === kind);
          return group.length
            ? col(t(key), [
                ...group.map((h) => (
                  // "Release 01 · 8 May 2026" → "01 · 8 May 2026": the column heading says Releases.
                  <li key={h.slug}><Link className={linkCls} to={`/${h.kind}/${h.slug}`}>{kind === "release" ? h.label.replace(/^Release /, "") : h.label}</Link></li>
                )),
                kind === "release" && <li key="tracker"><Link className={linkCls} to="/releases">{t("footer.tracker")}</Link></li>,
              ])
            : null;
        })}
        {col(t("footer.resources"), [
          // static predecessor archive (war-gov-ufo-release repo)
          <li key="release"><a className={linkCls} href="https://release.realufo.org/" target="_blank" rel="noopener">{t("footer.original")}</a></li>,
          <li key="shelf"><Link className={linkCls} to="/shelf">{t("footer.shelf")}</Link></li>,
          <li key="newsletter"><Link className={linkCls} to="/newsletter">{t("footer.newsletter")}</Link></li>,
          <li key="podcast"><Link className={linkCls} to="/podcast">{t("footer.podcast")}</Link></li>,
          // SDK packages (proper nouns — no translation needed)
          <li key="npm"><a className={linkCls} href="https://www.npmjs.com/package/realufo" target="_blank" rel="noopener">npm package ↗</a></li>,
          <li key="pypi"><a className={linkCls} href="https://pypi.org/project/realufo/" target="_blank" rel="noopener">PyPI package ↗</a></li>,
          <li key="mcp"><a className={linkCls} href="https://www.npmjs.com/package/realufo-mcp" target="_blank" rel="noopener">MCP server ↗</a></li>,
          ...FILES.map(([text, href]) => (
            <li key={href}><a className={linkCls} href={href}>{text === "Open dataset" ? t("footer.openDataset") : text}</a></li>
          )),
        ])}
        {/* Page-specific links ("This file") go last: site navigation first. */}
        {page?.links.length
          ? col(page.title, page.links.map((l) => (
              <li key={l.to}><Link className="text-signal hover:underline" to={l.to}>{l.text}</Link></li>
            )))
          : null}
      </nav>
      {/* Legal + contact + display prefs: the small print. */}
      <div className="mt-8 flex flex-wrap items-start justify-between gap-4 border-t border-line pt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li><a className={linkCls} href="mailto:hello@realufo.org">hello@realufo.org</a></li>
          <li><Link className={linkCls} to="/about">{t("footer.about")}</Link></li>
          <li><Link className={linkCls} to="/contact">{t("footer.contact")}</Link></li>
          <li><Link className={linkCls} to="/faq">{t("footer.faq")}</Link></li>
          <li><Link className={linkCls} to="/glossary">{t("footer.glossary")}</Link></li>
          <li><Link className={linkCls} to="/foia">{t("footer.foia")}</Link></li>
          <li><Link className={linkCls} to="/sites">{t("footer.sites")}</Link></li>
          <li><Link className={linkCls} to="/developers">{t("footer.developers")}</Link></li>
          <li><Link className={linkCls} to="/privacy">{t("footer.privacy")}</Link></li>
          <li><Link className={linkCls} to="/terms">{t("footer.terms")}</Link></li>
        </ul>
        <div className="flex flex-col items-end gap-2" role="group" aria-label="Display preferences">
          <div className="flex items-center gap-2">
            <div aria-label="Appearance" role="group"><AppearanceSwitcher /></div>
          </div>
          {/* Wishing pool: anonymous content-request form (Google Forms), under the scanlines toggle. */}
          <a className="text-signal hover:underline" href="https://docs.google.com/forms/d/e/1FAIpQLSesgIQPmSYoGsR4n2nkKMp18enYripao1yezoO62kHtKPIqJw/viewform" target="_blank" rel="noopener">{t("footer.request")}</a>
        </div>
      </div>
    </footer>
  );
}

/** A brand mark from ICONS (e.g. "X"), sized like a lucide icon. */
export function BrandIcon({ name, size = 14 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}
