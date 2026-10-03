// Desktop (>=900px) top nav bar. Ported from realufo-handoff/RealUFO.dc.html
// lines 80-96: brand block (saucer + REALUFO wordmark) | nav items | theme
// toggle (the prototype's online count + dead GUEST button were dropped). Nav buttons are react-router `Link`s (not the
// prototype's onClick handlers) so the URL bar / back-forward / open-in-tab
// all work for free.
//
// On desktop the separate AppBar is NOT rendered (see AppShell) — its
// contextual page title/sub is folded into this single bar instead, so
// desktop shows one nav, not two. No back button here: the browser's own back
// covers desktop.
import { Link, useLocation } from "react-router-dom";
import { Saucer } from "./Saucer";
import { retapTab, tabHref, useNavItems, type NavTab } from "./navItems";
import { ThemeToggle } from "./ThemeToggle";
import { usePageTitle, DEFAULT_PAGE_TITLE } from "../lib/pageTitle";

const OWN_H1 = /^\/(doc|case|browse|release|agency|location|decade)(\/|$)/;

export interface TopNavProps {
  activeTab: NavTab;
}

export function TopNav({ activeTab }: TopNavProps) {
  // No Feed item: the brand logo already links to "/" and the bar needs the room.
  const navItems = useNavItems().filter((i) => i.tab !== "feed");
  const { title, sub } = usePageTitle();
  const here = useLocation();
  const { pathname } = here;
  // Suppress the contextual block on the root/Feed tab — its title is
  // "REALUFO", which the brand wordmark already shows (avoids a dupe) — and on
  // pages that open with their own full <h1> (doc, case, browse, hubs).
  const showContext = title !== DEFAULT_PAGE_TITLE.title && !OWN_H1.test(pathname);

  return (
    <nav data-topnav className="flex flex-none items-center gap-5 border-b border-line bg-bg2 px-[26px] py-3">
      <a href="/" className="flex flex-none items-center gap-[11px] border-r border-line pr-1.5">
        <div className="flex-none">
          <Saucer />
        </div>
        <div className="pr-3.5 font-pixel text-[11px] text-ink">
          REAL<span className="text-signal">UFO</span>
        </div>
      </a>

      <div className="flex flex-none items-center gap-1">
        {navItems.map((item) => {
          const active = activeTab === item.tab;
          const href = tabHref(item, activeTab);
          return (
            <Link
              key={item.tab}
              to={href}
              onClick={active ? () => retapTab(href, here) : undefined}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-[44px] flex-none items-center gap-[9px] rounded-[11px] px-3.5 py-2 font-mono text-[13px] font-medium" +
                (active ? "" : " hover:bg-surface")
              }
              style={{
                color: active ? "var(--signal)" : "var(--dim)",
                background: active ? "var(--signal-dim)" : undefined,
              }}
            >
              <span className="text-center text-[15px]">{item.glyph}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Contextual page title/sub — the "bottom bar" description, folded in. */}
      <div className={"min-w-0 flex-1 leading-[1.15]" + (showContext ? " border-l border-line pl-4" : "")}>
        {showContext && (
          <>
            <div className="truncate font-pixel text-[10px] text-ink">{title}</div>
            <div className="mt-1 truncate font-mono text-[9.5px] tracking-[.5px] text-faint">{sub}</div>
          </>
        )}
      </div>

      <ThemeToggle className="h-9 w-9" />
    </nav>
  );
}

export default TopNav;
