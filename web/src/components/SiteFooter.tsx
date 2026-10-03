// Site-wide footer under every screen: the archive's ways in (tabs + hub
// pages) and the machine-readable files, so they're always one scroll away
// instead of buried in page content. Same hub list as /browse.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import type { HubKind } from "../api/types";
import { useNavItems } from "./navItems";
import { useFooterLinks } from "../lib/footerLinks";
import { AppearanceSwitcher } from "./AppearanceSwitcher";
import { SOCIAL_PROFILES } from "../../../worker/lib/profiles";

const GROUPS: [HubKind, string][] = [["release", "Releases"], ["agency", "Agencies"], ["decade", "Decades"]];
// Plain <a>: served by the Worker, not SPA routes.
const FILES = [
  ["llms.txt", "/llms.txt"],
  ["llms-full.txt", "/llms-full.txt"],
  ["sitemap.xml", "/sitemap.xml"],
  ["RSS feed", "/rss.xml"],
];

const linkCls = "text-dim hover:text-ink";
const headCls = "mb-2 font-semibold tracking-[.5px] text-ink";

export default function SiteFooter() {
  const hubs = useHubs().data?.hubs ?? [];
  const nav = useNavItems();
  const page = useFooterLinks();
  const col = (title: string, items: ReactNode[]) => (
    <div key={title} className="min-w-[120px]">
      <h2 className={headCls}>{title}</h2>
      <ul className="space-y-1">{items}</ul>
    </div>
  );
  return (
    <footer data-site-footer className="mt-12 border-t border-line pt-6 font-mono text-[11px]">
      <nav aria-label="Site" className="flex flex-wrap gap-x-8 gap-y-5">
        {page?.links.length
          ? col(page.title, page.links.map((l) => (
              <li key={l.to}><Link className="text-signal hover:underline" to={l.to}>{l.text}</Link></li>
            )))
          : null}
        {col("Explore", [
          ...nav.map((i) => (
            <li key={i.path}><Link className={linkCls} to={i.path}>{i.label}</Link></li>
          )),
          <li key="browse"><Link className={linkCls} to="/browse">Browse all</Link></li>,
          <li key="cases"><Link className={linkCls} to="/cases">Cold cases</Link></li>,
          // static predecessor archive (war-gov-ufo-release repo)
          <li key="release"><a className={linkCls} href="https://release.realufo.org/" target="_blank" rel="noopener">Original release archive ↗</a></li>,
          <li key="source"><a className={linkCls} href="https://github.com/hectorchanht/realufo" target="_blank" rel="noopener">Source code on GitHub ↗</a></li>,
          <li key="contact"><a className={linkCls} href="mailto:hello@realufo.org">Contact: hello@realufo.org</a></li>,
          <li key="privacy"><Link className={linkCls} to="/privacy">Privacy</Link></li>,
          <li key="terms"><Link className={linkCls} to="/terms">Terms</Link></li>,
        ])}
        {col("Follow", SOCIAL_PROFILES.map(([name, url]) => (
          <li key={name}><a className={linkCls} href={url} target="_blank" rel="noopener me">{name} ↗</a></li>
        )))}
        {GROUPS.map(([kind, title]) => {
          const group = hubs.filter((h) => h.kind === kind);
          return group.length
            ? col(title, group.map((h) => (
                <li key={h.slug}><Link className={linkCls} to={`/${h.kind}/${h.slug}`}>{h.label}</Link></li>
              )))
            : null;
        })}
        {col("For AI & developers", FILES.map(([text, href]) => (
          <li key={href}><a className={linkCls} href={href}>{text}</a></li>
        )))}
        <div className="min-w-[120px]">
          <h2 className={headCls}>Appearance</h2>
          <AppearanceSwitcher />
        </div>
      </nav>
      <p className="mt-6 text-faint">Public-domain U.S. government records, mirrored verbatim.</p>
    </footer>
  );
}
