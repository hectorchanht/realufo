// Shared nav definitions for TopNav/BottomTab + route->tab / route->header
// mapping used by AppShell. Ported from realufo-handoff/RealUFO.dc.html's
// `renderVals()` (lines 566-576):
//   navDef   = [['feed','◎','Feed'],['archive','▦','Archive'],['boards','◈','Boards'],['map','◐','Map']]
//   titles   = {feed:[...], archive:[...], boards:[...], map:[...]}
//   curTab   = doc->archive, thread|board->boards, case->feed, else same
// Kept in its own module (rather than inside AppShell.tsx) so TopNav/BottomTab
// can import it without an AppShell<->nav-component import cycle.

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

export interface Header {
  title: string;
  sub: string;
}

const STATIC_TITLES: Record<"feed" | "archive" | "boards" | "map", Header> = {
  feed: { title: "REALUFO", sub: "Declassified UAP archive + forum" },
  archive: { title: "THE ARCHIVE", sub: "91,808 records · 15 sources" },
  boards: { title: "THE BOARDS", sub: "Anonymous. Mostly." },
  map: { title: "SIGHTING MAP", sub: "Where the files come from" },
};

/**
 * AppBar header title/subtitle for a path. For the four static tabs this is
 * the prototype's verbatim `titles` map. For the data-driven routes
 * (doc/thread/board/case) this is the prototype's own "no match found"
 * fallback (e.g. `ht=(r&&r.agency)||'FILE'` when `r` is undefined) — exactly
 * what applies here since Task 14's screens are placeholders with no fetched
 * record/thread/board/case yet. Tasks 17-23 may refine this per-screen once
 * real data is available (e.g. a Doc screen setting the real record's agency).
 */
export function headerForPath(pathname: string): Header {
  if (pathname.startsWith("/doc/")) return { title: "FILE", sub: "" };
  if (pathname.startsWith("/thread/")) return { title: "THREAD", sub: "" };
  if (pathname.startsWith("/board/")) return { title: "BOARD", sub: "" };
  if (pathname.startsWith("/case/")) return { title: "COLD CASE", sub: "" };
  if (pathname === "/archive") return STATIC_TITLES.archive;
  if (pathname === "/boards") return STATIC_TITLES.boards;
  if (pathname === "/map") return STATIC_TITLES.map;
  return STATIC_TITLES.feed;
}

/**
 * document.title per route (FRONTEND-CONTEXT.md "Routing (Task 14)": "Client
 * should set document.title per route (default 'RealUFO — Declassified UAP
 * Archive')"). Root path uses that literal default; every other route reuses
 * headerForPath's title with a "— RealUFO" suffix until a later screen task
 * has real data to title the tab with instead.
 */
export function documentTitleForPath(pathname: string): string {
  if (pathname === "/") return "RealUFO — Declassified UAP Archive";
  return `${headerForPath(pathname).title} — RealUFO`;
}
