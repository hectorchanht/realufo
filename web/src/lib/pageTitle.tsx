// Contextual AppBar page title/subtitle. Ported from
// realufo-handoff/RealUFO.dc.html's per-view `[title,sub]` computation
// (lines 566-572, `renderVals()`): the four tab screens set a static pair,
// the four detail screens (doc/thread/board/case) set one derived from their
// own fetched entity once it loads. AppShell (Task 14) originally sourced the
// AppBar's title/sub from a purely path-based lookup (navItems.ts's `
// headerForPath`, now removed) with a generic placeholder for every detail
// route ("FILE", "THREAD", ...) since no screen had real data wired up yet.
// This module replaces that lookup with a small context: PageTitleProvider
// holds the live `{title,sub}` state, AppBar reads it via `usePageTitle()`,
// and each screen pushes its own value via `useSetPageTitle(title, sub)` in
// an effect once it knows what to show.
//
// PageTitleProvider must be an ancestor of BOTH AppBar and the routed screens
// for a screen's `useSetPageTitle` call to reach the AppBar reading it — see
// AppShell.tsx, which wraps the whole `<AppBar/>` + `<Outlet/>` subtree in
// one instance.
//
// The context's default value (used when no <PageTitleProvider> ancestor
// exists) is a real object with a no-op setter rather than `null` + a "must
// be used within a provider" throw — several screen test suites
// (doc.test.tsx, thread.test.tsx, case.test.tsx, boards.test.tsx,
// map.test.tsx) render a screen standalone under a bare
// `MemoryRouter`+`Routes`, with no AppShell/PageTitleProvider anywhere in the
// tree; `useSetPageTitle` must still be safe to call there — it just has
// nothing to update (document.title still gets set, same as in the full
// app).
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface PageTitleValue {
  title: string;
  sub: string;
}

// Feed's own [title,sub] (RealUFO.dc.html:566) doubles as the provider's
// initial state and the "is this the root tab" check `useSetPageTitle` uses
// to pick the plain document.title default.
export const DEFAULT_PAGE_TITLE: PageTitleValue = {
  title: "REALUFO",
  sub: "Declassified UAP archive + forum",
};

// index.html's own static <title> / the prototype's implicit root default.
const DEFAULT_DOCUMENT_TITLE = "RealUFO — Declassified UAP Archive";

interface PageTitleContextValue {
  value: PageTitleValue;
  setValue: (next: PageTitleValue) => void;
}

const PageTitleContext = createContext<PageTitleContextValue>({
  value: DEFAULT_PAGE_TITLE,
  setValue: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PageTitleValue>(DEFAULT_PAGE_TITLE);
  return <PageTitleContext.Provider value={{ value, setValue }}>{children}</PageTitleContext.Provider>;
}

/** AppBar's read side — the currently-set `{title,sub}`. */
export function usePageTitle(): PageTitleValue {
  return useContext(PageTitleContext).value;
}

/**
 * A screen's write side. Call unconditionally near the top of the screen
 * component (before any early loading/not-found return, so hook order never
 * varies across renders) — pass whatever's available yet; while a detail
 * screen's data hasn't loaded, its own generic fallback title ("FILE",
 * "THREAD", ...) is a fine value here, same as the prototype's own
 * `(r&&r.agency)||'FILE'` pattern (RealUFO.dc.html:568).
 *
 * Also sets `document.title` — the plain RealUFO default on the root/
 * "REALUFO" title (matching index.html's own static `<title>`), else
 * `${title} · RealUFO` (matching the Worker's own per-route `<title>`
 * convention for crawlers, worker/lib/meta.ts's `injectMeta`).
 */
export function useSetPageTitle(title: string, sub: string): void {
  const { setValue } = useContext(PageTitleContext);
  useEffect(() => {
    setValue({ title, sub });
    document.title = title === DEFAULT_PAGE_TITLE.title ? DEFAULT_DOCUMENT_TITLE : `${title} · RealUFO`;
  }, [title, sub, setValue]);
}
