// Feed screen tests (Task 17). Mocks useBootstrap/useFeed (and useVote, since
// ThreadRow's VoteButton pulls it too — see tests/components.test.tsx for the
// same convention) at the api/queries module boundary so the screen renders
// off a small deterministic fixture instead of hitting the (absent, in
// tests) Worker. Rendered via `renderAppAt("/")` (web/src/tests/util.tsx) so
// the real router/AppShell tree is exercised, including navigation to the
// (still-placeholder) Doc screen when a DocCard is clicked.
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import type { Bootstrap, Feed as FeedResponse } from "../api/types";
import { renderAppAt } from "./util";

const mockBootstrap: Bootstrap = {
  archives: [{ id: "wargov", label: "War/Gov Archive", flag: "🎖", accent: "#6ea8ff", count: 900, coord: "" }],
  boards: [],
  stats: {
    records: 91808,
    archives: 15,
    countries: 40,
    videos: 120,
    onlineNow: 12,
    threads: 300,
    postsToday: 40,
    yearsCovered: 78,
    byDecade: [],
    topLocations: [],
  },
  ticker: [
    { kind: "thread", board: "/uap/", text: "New sighting reported near Area 51", ago: "2m" },
    { kind: "post", board: "/gov/", text: "FOIA doc released", ago: "5m" },
  ],
  sightings: [],
  cases: [],
};

const mockFeed: FeedResponse = {
  featured: [
    {
      id: "rec1",
      archive: "wargov",
      agency: "CIA",
      title: "CIA-UAP-017, Placement on High Alert",
      summary: "summary text",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      credible: 240,
      commentN: 12,
    },
    {
      id: "rec2",
      archive: "wargov",
      agency: "FBI",
      title: "Roswell debris field recovery memo",
      summary: "summary text",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      credible: 88,
      commentN: 4,
    },
  ],
  hot: [
    {
      id: "th1",
      no: 42,
      board_id: "uap",
      boardSlug: "/uap/",
      accent: "#9184d9",
      title: "Something strange over the coast last night",
      op_body: "Saw three lights moving in formation, no sound at all.",
      stance: "believer",
      reply_count: 3,
      img_count: 1,
      votes: 12,
      hot: 1,
      ago: "2h",
    },
  ],
};

vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: mockBootstrap, isLoading: false }),
  useFeed: () => ({ data: mockFeed, isLoading: false }),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
  // Stubs for the real Doc screen (Task 19) — clicking a featured DocCard
  // below navigates to /doc/:id, which now calls these for real; `data:
  // undefined` resolves Doc straight to its "file not found" state, which is
  // all this suite needs (it only asserts that routing happened).
  useRecord: () => ({ data: undefined, isLoading: false }),
  useComments: () => ({ data: undefined, isLoading: false }),
  useRecords: () => ({ data: undefined, isLoading: false }),
}));

describe("Feed", () => {
  it("renders both featured DocCards", async () => {
    renderAppAt("/");
    expect(await screen.findByText(/CIA-UAP-017/)).toBeInTheDocument();
    expect(screen.getByText(/Roswell debris field recovery memo/)).toBeInTheDocument();
  });

  it("renders the hot ThreadRow", async () => {
    renderAppAt("/");
    expect(await screen.findByText(/Something strange over the coast/)).toBeInTheDocument();
  });

  it("shows the LIVE ticker with bootstrap items", async () => {
    renderAppAt("/");
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    expect(screen.getAllByText(/New sighting reported near Area 51/).length).toBeGreaterThan(0);
  });

  it("navigates to /doc/:id when a featured DocCard is clicked", async () => {
    renderAppAt("/");
    const title = await screen.findByText(/CIA-UAP-017/);
    const card = title.closest("a");
    expect(card).toHaveAttribute("href", "/doc/rec1");
    fireEvent.click(card as HTMLElement);
    // Real Doc screen (Task 19) — with useRecord() stubbed to `undefined`
    // above, it resolves straight to its "file not found" state; this only
    // needs to prove the click navigated to the /doc/:id route.
    await screen.findByText(/file not found/i, { selector: "[data-screen='doc']" });
  });

  it("links 'all boards ›' to /boards", async () => {
    renderAppAt("/");
    const link = await screen.findByRole("link", { name: /all boards/i });
    expect(link).toHaveAttribute("href", "/boards");
  });

  it("shows the archive CTA using the bootstrap stats count and links to /archive", async () => {
    renderAppAt("/");
    expect(await screen.findByText(/91,808 FILES · 15 ARCHIVES/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /BROWSE THE ARCHIVE/i });
    expect(link).toHaveAttribute("href", "/archive");
  });
});
