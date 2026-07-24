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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import type { Bootstrap, RecordsListResponse } from "../api/types";
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

const useRecordsMock = vi.fn();

vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: mockBootstrap, isLoading: false }),
  useRecords: (params: Record<string, unknown>) => useRecordsMock(params),
}));

beforeEach(() => {
  useRecordsMock.mockReset();
  useRecordsMock.mockImplementation((params: { archive?: string }) => {
    if (params.archive === "nara") return { data: naraOnly, isLoading: false };
    return { data: allRecords, isLoading: false };
  });
});

describe("Archive", () => {
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
    const chip = screen.getByRole("button", { name: /NARA/ });
    fireEvent.click(chip);

    await waitFor(() =>
      expect(useRecordsMock).toHaveBeenLastCalledWith(expect.objectContaining({ archive: "nara" })),
    );
    expect(await screen.findByText(/Blue Book Case File 1952/)).toBeInTheDocument();
    expect(screen.queryByText(/CIA-UAP-017/)).not.toBeInTheDocument();
  });

  it('shows "no records match" when the result count is 0', async () => {
    useRecordsMock.mockReturnValue({ data: empty, isLoading: false });
    renderAppAt("/archive");
    expect(await screen.findByText(/no records match/i)).toBeInTheDocument();
  });
});
