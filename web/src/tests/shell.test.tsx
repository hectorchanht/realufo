import { screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { renderAppAt } from "./util";

// Whichever of TopNav (desktop) / BottomTab (mobile) rendered — the shell
// only ever mounts one of the two (see AppShell.tsx), so exactly one exists.
function getNavContainer(): HTMLElement {
  const nav = document.querySelector<HTMLElement>("[data-topnav], [data-bottomtab]");
  if (!nav) throw new Error("expected TopNav or BottomTab to render");
  return nav;
}

// jsdom in this project's vitest setup has no `matchMedia` at all
// (`typeof window.matchMedia === "undefined"`), so useMediaQuery always
// reports mobile (see useMediaQuery.ts's SSR-safe fallback). To exercise the
// desktop layout deterministically, stub `matchMedia` to report a match for
// the "(min-width:900px)" query AppShell uses.
let restoreMatchMedia: (() => void) | null = null;

function stubDesktopMatchMedia() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("900px"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
  restoreMatchMedia = () => {
    window.matchMedia = original;
  };
}

afterEach(() => {
  restoreMatchMedia?.();
  restoreMatchMedia = null;
});

describe("AppShell", () => {
  it("shows nav labels Feed/Archive/Boards/Map and marks Feed active at /", async () => {
    renderAppAt("/");

    // Real Feed screen (Task 17) rendered through the router Outlet — its
    // section headers are always-rendered static markup (not gated on query
    // data), so this resolves synchronously and confirms routing resolved
    // "/" before asserting on nav.
    await screen.findByText("◆ Hot right now", { selector: "[data-screen='feed'] *" });

    // Scoped to the nav container itself: jsdom's matchMedia is a no-op here
    // (see useMediaQuery.ts), so the mobile layout (AppBar+BottomTab) renders
    // by default — but both TopNav and BottomTab render the same four nav
    // labels, so this holds regardless of layout. Scoping avoids ambiguity
    // with the Outlet's own "Feed" placeholder text living elsewhere in the DOM.
    const nav = within(getNavContainer());
    expect(nav.getByText("Feed")).toBeInTheDocument();
    expect(nav.getByText("Archive")).toBeInTheDocument();
    expect(nav.getByText("Boards")).toBeInTheDocument();
    expect(nav.getByText("Map")).toBeInTheDocument();

    const feedLink = nav.getByRole("link", { name: /Feed/i });
    expect(feedLink).toHaveAttribute("aria-current", "page");
  });

  it("marks Archive active at /archive", async () => {
    renderAppAt("/archive");
    // Real Archive screen (Task 18) rendered through the router Outlet — its
    // search bar/chip row are always-rendered static markup (not gated on
    // query data), so this resolves synchronously and confirms routing
    // resolved "/archive" before asserting on nav.
    await screen.findByPlaceholderText(/search 91,808 records/i);
    const nav = within(getNavContainer());
    expect(nav.getByRole("link", { name: /Archive/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Boards active at /board/:slug (curTab mapping: board -> boards tab)", async () => {
    renderAppAt("/board/ufo-sightings");
    // Real Board screen (Task 20) — its api/queries hooks aren't mocked in
    // this suite, so this only waits for its always-rendered
    // `data-screen="board"` wrapper (present in every branch: loading,
    // not-found, or loaded), not for any specific fetched content (same
    // convention as the /doc/:id case below).
    await waitFor(() => expect(document.querySelector("[data-screen='board']")).toBeInTheDocument());
    const nav = within(getNavContainer());
    expect(nav.getByRole("link", { name: /Boards/i })).toHaveAttribute("aria-current", "page");
  });

  it("renders AppBar unconditionally — alongside TopNav on desktop, not only on mobile", async () => {
    stubDesktopMatchMedia();
    renderAppAt("/");
    await screen.findByText("◆ Hot right now", { selector: "[data-screen='feed'] *" });

    expect(document.querySelector("[data-topnav]")).toBeTruthy();
    expect(document.querySelector("[data-bottomtab]")).toBeFalsy();
    // The prototype's data-appbar div has no sc-if of its own (RealUFO.dc.html:100)
    // — it renders on every device size, so it must be present here too.
    expect(document.querySelector("[data-appbar]")).toBeTruthy();
  });

  it("hides the AppBar back button on tab-root destinations (/, /archive, /boards, /map)", async () => {
    renderAppAt("/archive");
    await screen.findByPlaceholderText(/search 91,808 records/i);
    expect(screen.queryByRole("button", { name: /back/i })).not.toBeInTheDocument();
  });

  it("shows the AppBar back button on detail routes (e.g. /doc/:id)", async () => {
    renderAppAt("/doc/abc123");
    // Real Doc screen (Task 19) — its api/queries hooks aren't mocked in this
    // suite, so this only waits for its always-rendered `data-screen="doc"`
    // wrapper (present in every branch: loading, not-found, or loaded), not
    // for any specific fetched content.
    await waitFor(() => expect(document.querySelector("[data-screen='doc']")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });
});
