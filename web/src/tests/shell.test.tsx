import { screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderAppAt } from "./util";

// Whichever of TopNav (desktop) / BottomTab (mobile) rendered — the shell
// only ever mounts one of the two (see AppShell.tsx), so exactly one exists.
function getNavContainer(): HTMLElement {
  const nav = document.querySelector<HTMLElement>("[data-topnav], [data-bottomtab]");
  if (!nav) throw new Error("expected TopNav or BottomTab to render");
  return nav;
}

describe("AppShell", () => {
  it("shows nav labels Feed/Archive/Boards/Map and marks Feed active at /", async () => {
    renderAppAt("/");

    // Placeholder Feed screen (Task 17 replaces it) rendered through the
    // router Outlet — confirms routing resolved "/" before asserting on nav.
    await screen.findByText("Feed", { selector: "[data-screen='feed']" });

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
    await screen.findByText("Archive", { selector: "[data-screen='archive']" });
    const nav = within(getNavContainer());
    expect(nav.getByRole("link", { name: /Archive/i })).toHaveAttribute("aria-current", "page");
  });

  it("marks Boards active at /board/:slug (curTab mapping: board -> boards tab)", async () => {
    renderAppAt("/board/ufo-sightings");
    await screen.findByText("Board", { selector: "[data-screen='board']" });
    const nav = within(getNavContainer());
    expect(nav.getByRole("link", { name: /Boards/i })).toHaveAttribute("aria-current", "page");
  });
});
