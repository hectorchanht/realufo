// AppBar contextual page-title tests (Task 23b). Mocks the same api/queries
// module boundary as feed.test.tsx/archive.test.tsx/doc.test.tsx (rather than
// a bespoke render harness) so Feed, Archive, and Doc can all render through
// the REAL router/AppShell tree (renderAppAt) — the only way to prove the
// PageTitleProvider mounted in AppShell.tsx actually reaches both AppBar
// (the reader) and the routed screen (the writer).
//
// The "/" and "/archive" cases are regression guards — the pre-existing
// path-based `headerForPath` fallback (now removed) already returned the
// right static text for tab roots, so these can't red/green on their own.
// The real bug this task fixes only shows up on a *detail* route: before
// this task, `/doc/:id`'s AppBar always showed the generic "FILE" title
// regardless of which record loaded (see navItems.ts's old `headerForPath`
// doc branch) — the third test below is the one that actually fails before
// Doc.tsx calls `useSetPageTitle`.
import { describe, it, expect, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { Bootstrap, CommentsResponse, Feed as FeedResponse, RecordDetail, RecordsListResponse } from "../api/types";
import { renderAppAt } from "./util";

const mockBootstrap: Bootstrap = {
  archives: [],
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
  ticker: [],
  sightings: [],
  cases: [],
};

const mockFeed: FeedResponse = { featured: [], hot: [] };
const emptyRecords: RecordsListResponse = { count: 0, records: [] };
const emptyComments: CommentsResponse = { comments: [] };

const mockDetail: RecordDetail = {
  record: {
    id: "rec1",
    archive: "wargov",
    agency: "CIA",
    agency_full: "Central Intelligence Agency",
    title: "CIA-UAP-017, Placement on High Alert near Roswell",
    summary: "A memo describing an unusual radar contact.",
    incident_date: "1978-03-04",
    location: "Roswell, NM",
    doc_date: "1978-04-01",
    kind: "pdf",
    redacted: 0,
    featured: 0,
    virin: "DOD-1978-00417",
    source_url: null,
    source_site: null,
    retrieved_at: null,
    license: null,
    status: "live",
    checksum: null,
    created_at: "2024-01-01",
  },
  assets: [],
  promotedThreads: [],
};

vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: mockBootstrap, isLoading: false }),
  useFeed: () => ({ data: mockFeed, isLoading: false }),
  useRecords: () => ({ data: emptyRecords, isLoading: false }),
  useRecord: () => ({ data: mockDetail, isLoading: false }),
  useComments: () => ({ data: emptyComments, isLoading: false }),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
}));

function getAppBar(): HTMLElement {
  const bar = document.querySelector<HTMLElement>("[data-appbar]");
  if (!bar) throw new Error("expected AppBar to render");
  return bar;
}

describe("AppBar contextual title", () => {
  it('shows "REALUFO" at "/"', async () => {
    renderAppAt("/");
    await screen.findByText("◆ Hot right now", { selector: "[data-screen='feed'] *" });
    expect(within(getAppBar()).getByText("REALUFO")).toBeInTheDocument();
  });

  it('shows "THE ARCHIVE" at "/archive"', async () => {
    renderAppAt("/archive");
    await screen.findByPlaceholderText(/search 91,808 records/i);
    expect(within(getAppBar()).getByText("THE ARCHIVE")).toBeInTheDocument();
  });

  it("shows the record's agency + short title at /doc/:id once the record loads (not the generic 'FILE' fallback)", async () => {
    renderAppAt("/doc/rec1");
    await screen.findByText(/Placement on High Alert near Roswell/, { selector: "[data-screen='doc'] h1" });

    const bar = within(getAppBar());
    expect(bar.getByText("CIA")).toBeInTheDocument();
    expect(bar.getByText("Placement on High Alert near Roswell")).toBeInTheDocument();
    expect(bar.queryByText("FILE")).not.toBeInTheDocument();
  });
});
