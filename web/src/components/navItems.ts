// Shared nav definitions for TopNav/BottomTab + route->tab mapping used by
// AppShell. Ported from realufo-handoff/RealUFO.dc.html's `renderVals()`
// (lines 566-576):
//   navDef   = [['feed','◎','Feed'],['archive','▦','Archive'],['boards','◈','Boards'],['map','◐','Map']]
//   curTab   = doc->archive, thread|board->boards, case->feed, else same
// Kept in its own module (rather than inside AppShell.tsx) so TopNav/BottomTab
// can import it without an AppShell<->nav-component import cycle.
//
// The route->header-title/subtitle mapping that used to live here
// (`headerForPath`/`documentTitleForPath`/`STATIC_TITLES`) moved to
// lib/pageTitle.tsx (Task 23b) — AppBar now reads a live, screen-set context
// value instead of a purely path-based lookup (which had no way to reflect a
// detail screen's actually-loaded data).

import type { NavigateFunction } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { forgetScroll, scrollKey } from "../lib/useScrollMemory";

export type NavTab = "feed" | "archive" | "shorts" | "ask" | "boards" | "map";

export interface NavItem {
  tab: NavTab;
  glyph: string;
  label: string;
  path: string;
}

export const NAV_ITEMS: NavItem[] = [
  { tab: "feed", glyph: "◎", label: "Feed", path: "/" },
  { tab: "archive", glyph: "▦", label: "Archive", path: "/archive" },
  // The Archive's Shorts grid (its "Shorts" type chip), as a tab of its own.
  { tab: "shorts", glyph: "▷", label: "Shorts", path: "/archive?type=shorts" },
  { tab: "ask", glyph: "◉", label: "Ask", path: "/ask" },
  { tab: "boards", glyph: "◈", label: "Boards", path: "/boards" },
  { tab: "map", glyph: "◐", label: "Map", path: "/map" },
];

// The Ask tab only shows while the server's ask flag is on.
export function useNavItems(): NavItem[] {
  const askOn = !!useBootstrap().data?.features?.ask;
  return askOn ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.tab !== "ask");
}

/**
 * Route -> active nav tab. Mirrors the prototype's `curTab` logic exactly:
 * doc screens highlight Archive, thread/board screens highlight Boards, case
 * screens highlight Feed (cold cases are reached from the feed, not a tab of
 * their own), everything else maps 1:1 to its own tab.
 */
/**
 * Whether AppBar's back chevron should show for a path. Ported from the
 * prototype's `canBack = hist.length>0` combined with the fact that
 * switching top-level tabs resets its navigation history — net effect: back
 * is absent on the tab-root destinations (`/`, `/archive`, `/ask`, `/boards`,
 * `/map`) and present on every detail screen (`/doc/:id`, `/thread/:id`,
 * `/board/:slug`, `/case/:slug`). Any path that isn't one of the nav roots is
 * a detail screen.
 */
export function canBackForPath(pathname: string): boolean {
  return !NAV_ITEMS.some((item) => item.path === pathname);
}

/** Where "back" goes when this page was the first one opened in the tab. */
export function parentPath(pathname: string): string {
  if (pathname.startsWith("/doc/")) return "/archive";
  if (pathname.startsWith("/thread/") || pathname.startsWith("/board/")) return "/boards";
  if (pathname.startsWith("/case/")) return "/cases";
  if (/^\/(release|agency|location|decade)\//.test(pathname)) return "/browse";
  if (pathname === "/browse") return "/archive";
  return "/";
}

/** In-app back: history when there is an earlier in-app page, else the parent page. */
export function goBack(navigate: NavigateFunction, pathname: string): void {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) navigate(-1);
  else navigate(parentPath(pathname), { replace: true });
}

export function activeTabForPath(pathname: string, search = ""): NavTab {
  if (pathname.startsWith("/shorts/")) return "shorts";
  if (pathname === "/archive" && new URLSearchParams(search).get("type") === "shorts") return "shorts";
  if (pathname.startsWith("/doc")) return "archive";
  if (pathname.startsWith("/archive")) return "archive";
  // Hubs (/browse, /release/6, /agency/fbi…) are ways into the archive.
  if (/^\/(browse|release|agency|location|decade)(\/|$)/.test(pathname)) return "archive";
  if (pathname.startsWith("/ask")) return "ask";
  if (pathname.startsWith("/board/") || pathname.startsWith("/thread")) return "boards";
  if (pathname === "/boards" || pathname.startsWith("/boards/")) return "boards";
  if (pathname.startsWith("/case")) return "feed";
  if (pathname.startsWith("/map")) return "map";
  return "feed"; // "/" and any unmatched path
}


// Last URL seen per tab, this session only (gone on reload): tapping a tab
// returns to where the user left it — detail screen, filters and all — and
// tapping the tab you're already in pops back to its root list, filters kept
// (Ask drops its ?q=, which is the question, not a filter).
// Scroll position is restored separately (lib/useScrollMemory.ts).
const lastUrl = new Map<NavTab, string>();
const lastRootUrl = new Map<NavTab, string>();

export function rememberTabUrl(pathname: string, search: string): void {
  // The Shorts player is a full-screen overlay, not a place a tab should reopen into.
  if (pathname.startsWith("/shorts/")) return;
  const tab = activeTabForPath(pathname, search);
  lastUrl.set(tab, pathname + search);
  // Ask's ?q= is the answer itself, not a filter — its root is the bare lists page.
  if (!canBackForPath(pathname)) lastRootUrl.set(tab, tab === "ask" ? pathname : pathname + search);
}

export function tabHref(item: NavItem, activeTab: NavTab): string {
  return (item.tab === activeTab ? lastRootUrl : lastUrl).get(item.tab) ?? item.path;
}

/** Re-tapping the active tab: its root list opens at the top, not where it was left. */
export function retapTab(href: string, here: { pathname: string; search: string }): void {
  const url = new URL(href, "http://x");
  const key = scrollKey(url.pathname, url.search);
  forgetScroll(key);
  // Already on the root: the link is a no-op navigation, so scroll by hand.
  if (key === scrollKey(here.pathname, here.search))
    document.querySelector("[data-scroll]")?.scrollTo?.({ top: 0, behavior: "smooth" });
}
