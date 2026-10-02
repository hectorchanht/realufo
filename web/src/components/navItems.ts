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

export type NavTab = "feed" | "archive" | "boards" | "map";

export interface NavItem {
  tab: NavTab;
  glyph: string;
  label: string;
  path: string;
}

export const NAV_ITEMS: NavItem[] = [
  { tab: "feed", glyph: "◎", label: "Feed", path: "/" },
  { tab: "archive", glyph: "▦", label: "Archive", path: "/archive" },
  { tab: "boards", glyph: "◈", label: "Boards", path: "/boards" },
  { tab: "map", glyph: "◐", label: "Map", path: "/map" },
];

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
 * is absent on the four tab-root destinations (`/`, `/archive`, `/boards`,
 * `/map`) and present on every detail screen (`/doc/:id`, `/thread/:id`,
 * `/board/:slug`, `/case/:slug`). Any path that isn't one of the nav roots is
 * a detail screen.
 */
export function canBackForPath(pathname: string): boolean {
  return !NAV_ITEMS.some((item) => item.path === pathname);
}

export function activeTabForPath(pathname: string): NavTab {
  if (pathname.startsWith("/doc")) return "archive";
  if (pathname.startsWith("/archive")) return "archive";
  if (pathname.startsWith("/board/") || pathname.startsWith("/thread")) return "boards";
  if (pathname === "/boards" || pathname.startsWith("/boards/")) return "boards";
  if (pathname.startsWith("/case")) return "feed";
  if (pathname.startsWith("/map")) return "map";
  return "feed"; // "/" and any unmatched path
}

