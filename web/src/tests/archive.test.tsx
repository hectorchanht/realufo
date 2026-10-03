// Archive screen tests (Task 18). Mocks useBootstrap/useRecords at the
// api/queries module boundary (same convention as tests/feed.test.tsx) so the
// screen renders off a small deterministic fixture instead of hitting the
// (absent, in tests) Worker — this also covers DocCard's internal
// `useBootstrap()` call, since it resolves to the same mocked module.
//
// `useRecords` is mocked as a `vi.fn()` whose implementation branches on the
// incoming params (archive/q), so a chip click / debounced search box can be
// asserted two ways at once: (1) the hook was actually invoked with the
// expected filter value (proving the URL-search-param -> useRecords wiring),
// and (2) the rendered DocCard grid changed to match (proving the screen
// re-renders off that new data) — see FRONTEND-CONTEXT.md's query-hooks
// contract and DocCard.tsx's header note on why it needs useBootstrap mocked
// here too.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { Bootstrap, RecordFacets, RecordsListResponse } from "../api/types";
import { renderAppAt } from "./util";

const mockBootstrap: Bootstrap = {
  archives: [
    { id: "wargov", label: "War.gov · PURSUE", flag: "🇺🇸", accent: "#9184d9", count: 222, coord: "" },
    { id: "nara", label: "NARA · Blue Book", flag: "🇺🇸", accent: "#c8d0dc", count: 12618, coord: "" },
  ],
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

const cardWargov = {
  id: "rec1",
  archive: "wargov",
  agency: "CIA",
  title: "CIA-UAP-017, Placement on High Alert",
  summary: "summary text",
  kind: "pdf" as const,
  redacted: 0,
  thumb: null,
  location: null,
  incident_date: null,
  doc_date: null,
};

const cardNara = {
  id: "rec2",
  archive: "nara",
  agency: "NARA",
  title: "Blue Book Case File 1952 Michigan",
  summary: "summary text",
  kind: "pdf" as const,
  redacted: 0,
  thumb: null,
  location: null,
  incident_date: null,
  doc_date: null,
};

const allRecords: RecordsListResponse = { count: 2, records: [cardWargov, cardNara] };
const naraOnly: RecordsListResponse = { count: 1, records: [cardNara] };
const empty: RecordsListResponse = { count: 0, records: [] };

const mockFacets: RecordFacets = {
  releases: [
    { no: 1, date: "2026-05-08", count: 158 },
    { no: 2, date: "2026-05-22", count: 64 },
  ],
  kinds: [{ name: "pdf", count: 391 }, { name: "video", count: 165 }],
  agencies: [{ name: "FBI", count: 11 }],
  decades: [{ decade: 1950, count: 40 }],
  locations: [{ name: "Harare, Zimbabwe", count: 1 }],
  flags: { redacted: 282, unredacted: 312, ai: 370, text: 429, moments: 165, featured: 14 },
};

const useRecordsMock = vi.fn();

vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: mockBootstrap, isLoading: false }),
  useRecords: (params: Record<string, unknown>) => useRecordsMock(params),
  useFacets: () => ({ data: mockFacets }),
  useHubs: () => ({
    data: { hubs: [{ kind: "agency", slug: "department-of-war", label: "Department of War", count: 267, values: ["DoW", "Department of War"] }] },
  }),
}));

const records = (params: { archive?: string }) =>
  params.archive === "nara" ? { data: naraOnly, isLoading: false } : { data: allRecords, isLoading: false };

beforeEach(() => {
  useRecordsMock.mockReset();
  useRecordsMock.mockImplementation(records);
});

// The first app render in a worker is cold (JIT, first jsdom/React paths):
// ~8x a warm one, which on a loaded machine blows the 1s findBy window of
// whichever test runs first. Pay it once here, with room to spare.
beforeAll(async () => {
  useRecordsMock.mockImplementation(records);
  renderAppAt("/archive");
  await screen.findByRole("navigation", { name: "Site" }, { timeout: 8000 });
  cleanup();
});

describe("Archive", () => {
  it("a single mapped tag filter's hub page is linked from the footer", async () => {
    renderAppAt("/archive?agency=DoW");
    const footer = await screen.findByRole("navigation", { name: "Site" });
    expect(await within(footer).findByRole("link", { name: "Department of War page" })).toHaveAttribute("href", "/agency/department-of-war");
    expect(within(footer).getByRole("heading", { name: "This filter" })).toBeInTheDocument();
  });

  it("no hub link for an unmapped filter value", async () => {
    renderAppAt("/archive?agency=IC");
    await screen.findByText(/CIA-UAP-017/);
    expect(screen.queryByRole("link", { name: /page$/ })).toBeNull();
  });

  it("browse, Ask and the original release archive live in the footer, not the page", async () => {
    renderAppAt("/archive");
    const footer = await screen.findByRole("navigation", { name: "Site" });
    expect(within(footer).getByRole("link", { name: "Browse all" })).toHaveAttribute("href", "/browse");
    expect(within(footer).getByRole("link", { name: /original archive/i })).toHaveAttribute("href", "https://release.realufo.org/");
    expect(screen.queryByRole("link", { name: /browse by release · agency · location · decade/i })).toBeNull();
  });
  it("renders records as DocCards", async () => {
    renderAppAt("/archive");
    expect(await screen.findByText(/CIA-UAP-017/)).toBeInTheDocument();
    expect(screen.getByText(/Blue Book Case File 1952/)).toBeInTheDocument();
  });

  it("shows the result count from the useRecords response", async () => {
    renderAppAt("/archive");
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText(/records · swipe a file to flip through/)).toBeInTheDocument();
  });

  it("debounces search input into the q filter passed to useRecords", async () => {
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);

    const input = screen.getByPlaceholderText(/search 91,808 records/i);
    fireEvent.change(input, { target: { value: "roswell" } });

    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ q: "roswell" })),
    );
  });

  it("clicking an archive chip sets the archive filter and re-renders the grid", async () => {
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);

    // getByRole (not getByText) — "NARA" also appears as the agency badge
    // (a plain <span>) on the "Blue Book" DocCard once it renders, which
    // would make an unscoped text query ambiguous; scoping to role="button"
    // uniquely picks the archive chip.
    const chip = screen.getByRole("button", { name: /^NARA/ });
    fireEvent.click(chip);

    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ archive: "nara" })),
    );
    expect(await screen.findByText(/Blue Book Case File 1952/)).toBeInTheDocument();
    expect(screen.queryByText(/CIA-UAP-017/)).not.toBeInTheDocument();
  });

  it("solid-fills a selected archive chip with the archive's own accent color; leaves others unfilled", async () => {
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);

    const naraChip = screen.getByRole("button", { name: /^NARA/ });
    const wargovChip = screen.getByRole("button", { name: /^War\.gov/ });

    // Unselected: neither chip carries an accent fill yet.
    expect(naraChip.getAttribute("style")).not.toContain("#c8d0dc");
    expect(wargovChip.getAttribute("style")).not.toContain("#9184d9");

    fireEvent.click(naraChip);
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ archive: "nara" })),
    );

    // Selected: solid-filled with the archive's own accent (not a tinted/
    // translucent version of it) — RealUFO.dc.html:592's `bg:archMap[c.id].accent`.
    expect(screen.getByRole("button", { name: /^NARA/ })).toHaveStyle({ background: "#c8d0dc" });
    // The other, still-unselected chip stays unfilled.
    expect(screen.getByRole("button", { name: /^War\.gov/ }).getAttribute("style")).not.toContain("#9184d9");
  });

  it("pages through results: next/number buttons set offset, filter change resets to page 1", async () => {
    useRecordsMock.mockImplementation(() => ({ data: { count: 1000, records: [cardWargov] }, isLoading: false }));
    renderAppAt("/archive?page=5");
    await screen.findByText(/CIA-UAP-017/);
    expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 40, offset: 160 }));

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    // 1000 / 40 = 25 pages: 1 … 4 5 6 … 25
    expect(nav.textContent).toBe("‹ prev1…456…25next ›");
    expect(screen.getByRole("button", { name: "5" })).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: /next/ }));
    await waitFor(() => expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 200 })));

    fireEvent.click(screen.getByRole("button", { name: "25" }));
    await waitFor(() => expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 960 })));
    expect(screen.getByRole("button", { name: /next/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /^Docs/ }));
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ type: "pdf", offset: 0 })),
    );
  });

  it("jump-to-page input navigates to the typed page, clamped to the last page", async () => {
    useRecordsMock.mockImplementation(() => ({ data: { count: 1000, records: [cardWargov] }, isLoading: false }));
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);

    fireEvent.change(screen.getByLabelText("jump to"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 440 })));
    expect(screen.getByLabelText("jump to")).toHaveValue(12);

    fireEvent.change(screen.getByLabelText("jump to"), { target: { value: "999" } });
    fireEvent.submit(screen.getByLabelText("jump to").closest("form")!);
    await waitFor(() => expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 960 })));
  });

  it("doc card links forward the archive's filters and page to /doc", async () => {
    useRecordsMock.mockImplementation(() => ({ data: { count: 1000, records: [cardWargov] }, isLoading: false }));
    renderAppAt("/archive?archive=wargov&page=3");
    const card = (await screen.findByText(/CIA-UAP-017/)).closest("a");
    expect(card).toHaveAttribute("href", "/doc/rec1?archive=wargov&page=3");
  });

  it("release chips and agency/decade/location selects write URL filters passed to useRecords", async () => {
    renderAppAt("/archive?page=2");
    await screen.findByText(/CIA-UAP-017/);

    fireEvent.click(screen.getByRole("button", { name: /^R02/ }));
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ release: "2", offset: 0 })),
    );
    expect(screen.getByRole("button", { name: /^R02/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Agency"), { target: { value: "FBI" } });
    fireEvent.change(screen.getByLabelText("Decade"), { target: { value: "1950" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Harare, Zimbabwe" } });
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ release: "2", agency: "FBI", decade: "1950", location: "Harare, Zimbabwe" }),
      ),
    );
    const card = (await screen.findByText(/CIA-UAP-017/)).closest("a");
    expect(card?.getAttribute("href")).toContain("release=2");

    fireEvent.click(screen.getByRole("button", { name: /clear all/ }));
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ release: undefined, agency: undefined, decade: undefined, location: undefined }),
      ),
    );
  });

  it("redaction chips are exclusive; has-chips combine; pills remove one filter; sort survives clear all", async () => {
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);
    const last = () => useRecordsMock.mock.lastCall![0];

    fireEvent.click(screen.getByRole("button", { name: "Redacted 282" }));
    await waitFor(() => expect(last().redacted).toBe("1"));
    fireEvent.click(screen.getByRole("button", { name: "Unredacted 312" }));
    await waitFor(() => expect(last().redacted).toBe("0"));
    expect(screen.getByRole("button", { name: "Redacted 282" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Unredacted 312" }));
    await waitFor(() => expect(last().redacted).toBeUndefined());

    fireEvent.click(screen.getByRole("button", { name: "AI summary 370" }));
    fireEvent.click(screen.getByRole("button", { name: "Featured 14" }));
    await waitFor(() => expect(last().has).toBe("ai,featured"));
    fireEvent.change(screen.getByLabelText("Agency"), { target: { value: "FBI" } });
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "old" } });
    await waitFor(() => expect(last()).toEqual(expect.objectContaining({ agency: "FBI", sort: "old" })));

    // one pill per active filter (sort is an order, not a filter)
    const pills = screen.getByRole("list", { name: "Active filters" });
    expect(within(pills).getAllByRole("button").map((b) => b.textContent)).toEqual(["FBI ✕", "AI summary ✕", "Featured ✕", "✕ clear all"]);
    fireEvent.click(within(pills).getByRole("button", { name: "Remove AI summary" }));
    await waitFor(() => expect(last().has).toBe("featured"));

    fireEvent.click(within(pills).getByRole("button", { name: /clear all/ }));
    await waitFor(() => expect(last()).toEqual(expect.objectContaining({ agency: undefined, has: undefined, sort: "old" })));
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("picking a non-war.gov archive drops the release filter and hides release chips", async () => {
    renderAppAt("/archive?release=1");
    await screen.findByText(/CIA-UAP-017/);
    fireEvent.click(screen.getByRole("button", { name: /^NARA/ }));
    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ archive: "nara", release: undefined })),
    );
    expect(screen.queryByRole("button", { name: /^R01/ })).not.toBeInTheDocument();
  });

  it("hides the pager when everything fits on one page", async () => {
    renderAppAt("/archive");
    await screen.findByText(/CIA-UAP-017/);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it('shows "no records match" when the result count is 0', async () => {
    useRecordsMock.mockReturnValue({ data: empty, isLoading: false });
    renderAppAt("/archive");
    expect(await screen.findByText(/no records match/i)).toBeInTheDocument();
  });
});
