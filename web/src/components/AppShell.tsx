// App frame: CRT background layers + responsive nav + the react-router
// <Outlet/> for screen content.
//
// Background layers ported from realufo-handoff/RealUFO.dc.html lines 68-70:
//   - radial-glow gradient (line 68) — added here (not in theme.css) per the
//     task brief; the other two layers reuse Task 12's `.crt-grain`/`.crt-scan`
//     classes from theme.css.
//   - `.crt-grain` (line 69) — always rendered.
//   - `.crt-scan` (line 70) — conditional on ThemeProvider's `scanlines` state
//     (the prototype wires this to the same toggle via `sc-if`).
//
// Nav layering matches the prototype exactly: `data-topnav` (line 80) and
// `data-bottomtab` (line 393) ARE device-gated (isDesktop/isMobile), but
// `data-appbar` (line 100) has NO `sc-if` of its own — it renders on every
// device size, inside `<main data-scroll>`, above the screen content. On
// desktop it sits as a secondary sticky bar under TopNav carrying the back
// button + per-screen title (needed since TopNav itself has no back
// affordance for detail screens like /doc/:id).
//
// `<PageTitleProvider>` (Task 23b — lib/pageTitle.tsx) wraps AppBar + the
// Outlet screens together, right here, so it's an ancestor of both: AppBar
// reads the live `{title,sub}` from context, and whichever screen the
// router mounts into `<Outlet/>` pushes its own contextual value into that
// same context via `useSetPageTitle`. This replaces the old purely
// path-based `headerForPath`/`documentTitleForPath` lookup (navItems.ts),
// which had no way to reflect a detail screen's actually-loaded data (every
// /doc/:id showed the same generic "FILE", regardless of record).
import { useEffect, useRef, type CSSProperties } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import SiteFooter from "./SiteFooter";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useHideOnScroll } from "../lib/useHideOnScroll";
import { useScrollMemory } from "../lib/useScrollMemory";
import { useTheme } from "../theme/useTheme";
import { PageTitleProvider } from "../lib/pageTitle";
import { OverlayHost } from "../overlays/OverlayProvider";
import { TopNav } from "./TopNav";
import { AppBar } from "./AppBar";
import { BottomTab } from "./BottomTab";
import { activeTabForPath, canBackForPath, rememberTabUrl } from "./navItems";

export function AppShell() {
  const isDesktop = useMediaQuery("(min-width:900px)");
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { scanlines } = useTheme();

  const activeTab = activeTabForPath(pathname);
  // canBack ports the prototype's `hist.length>0` (back only on detail
  // screens — switching top-level tabs resets its history) — see
  // navItems.ts's canBackForPath doc comment.
  const canBack = canBackForPath(pathname);

  // Mobile: AppBar + BottomTab slide out while scrolling down, back on scroll
  // up. BottomTab is an overlay (absolute, not in flow) so hiding it never
  // reflows <main> — a resizing scroll container clamps scrollTop and would
  // feed a fake "scroll up" back into the hook. Its measured height is
  // published as --bnav-h (screen bottom padding) and --bnav-y (what sticky
  // bottom bars like Thread's reply bar offset by: 0 while the tab is hidden).
  const scrollRef = useRef<HTMLElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const bnavRef = useRef<HTMLDivElement>(null);
  // useScrollMemory runs first (layout effect) so the hide hook starts from
  // the restored scrollTop and doesn't read the jump as a scroll-down.
  useScrollMemory(scrollRef, pathname + search);
  const navHidden = useHideOnScroll(scrollRef, !isDesktop, pathname + search);
  useEffect(() => rememberTabUrl(pathname, search), [pathname, search]);

  useEffect(() => {
    const nav = bnavRef.current;
    const shell = shellRef.current;
    if (!nav || !shell || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => shell.style.setProperty("--bnav-h", `${nav.offsetHeight}px`));
    ro.observe(nav);
    return () => {
      ro.disconnect();
      shell.style.removeProperty("--bnav-h");
    };
  }, [isDesktop]);

  return (
    // PageTitleProvider wraps the WHOLE shell so both the desktop TopNav (which
    // now shows the contextual title/sub) AND the routed screens (which set it
    // via useSetPageTitle) are inside it. On desktop the AppBar is not rendered
    // — TopNav is the single merged bar; on mobile TopNav is absent and the
    // AppBar is the top bar.
    <PageTitleProvider>
      <div data-app-shell className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-bg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(1200px 500px at 78% -8%, var(--signal-dim), transparent 60%), radial-gradient(900px 500px at 10% 108%, rgba(70,223,255,.06), transparent 55%)",
          }}
        />
        <div aria-hidden="true" className="crt-grain" />
        {scanlines && <div aria-hidden="true" className="crt-scan" />}

        <div
          ref={shellRef}
          data-shell
          className="relative z-10 flex min-h-0 flex-1 flex-col"
          style={{ "--bnav-y": navHidden ? "0px" : "var(--bnav-h, 0px)" } as CSSProperties}
        >
          {isDesktop && (
            <TopNav activeTab={activeTab} canBack={canBack} onBack={() => navigate(-1)} />
          )}

          <main
            ref={scrollRef}
            data-scroll
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {!isDesktop && (
              <AppBar canBack={canBack} onBack={() => navigate(-1)} showBrand={!canBack} hidden={navHidden} />
            )}

            <div
              data-screenpad
              className="relative px-4 pt-[18px]"
              style={{ paddingBottom: "calc(2.5rem + var(--bnav-h, 0px))" }}
            >
              <Outlet />
              <SiteFooter />
            </div>
          </main>

          {!isDesktop && <BottomTab ref={bnavRef} activeTab={activeTab} hidden={navHidden} />}
        </div>

        {/* Overlays (Composer/MediaViewer/LoginSheet/Toast) mount INSIDE the
            router tree — the Composer calls useNavigate() (to jump to a newly
            created /thread/:id), which throws without a <Router> ancestor. They
            are fixed-position (z-70+) so DOM placement here doesn't affect
            layout; being inside AppShell (a route element) gives them the router
            context. OverlayProvider still wraps RouterProvider in App.tsx, so the
            context is available here. */}
        <OverlayHost />
      </div>
    </PageTitleProvider>
  );
}

export default AppShell;
