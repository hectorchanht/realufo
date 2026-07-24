// Sighting Map + stats screen tests (Task 23). `useBootstrap` is mocked at
// the api/queries module boundary (same convention as tests/boards.test.tsx)
// as a `vi.fn()` wrapper so individual tests can override the return value.
// `useOverlay` is mocked at the overlays/OverlayProvider module boundary so
// `toast` can be spied on directly (same convention as tests/doc.test.tsx).
// `useNavigate` is spied on the same way tests/doc.test.tsx does (everything
// else — MemoryRouter, Routes, Route, useParams — stays real) so a tap on a
// dot with a `case_slug` can assert *where* it navigates without needing a
// full router+screen tree for the destination.
//
// Fixture values (Roswell's lat/lng, the byDecade/topLocations pairs) are
// taken from realufo-handoff/data.js's `mapPoints`/`stats` so the `project()`
// assertion below can be checked directly against the prototype's own
// precomputed `x`/`y` (data.js's Roswell entry: x:0.20966666666666667,
// y:0.3145).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Bootstrap, Sighting } from "../api/types";
import { project } from "../lib/map";
import MapScreen from "../screens/Map";

const mockToast = vi.fn();
vi.mock("../overlays/OverlayProvider", () => ({
  useOverlay: () => ({ toast: mockToast }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const useBootstrapMock = vi.fn();
vi.mock("../api/queries", () => ({
  useBootstrap: () => useBootstrapMock(),
}));

// Roswell: has a case_slug -> tapping navigates to /case/roswell.
const roswell: Sighting = {
  id: 1,
  name: "Roswell, NM",
  lat: 33.39,
  lng: -104.52,
  count: 412,
  accent: "#c8d0dc",
  case_slug: "roswell",
};

// Kaikoura here deliberately has NO case_slug -> tapping should toast, not navigate.
const kaikoura: Sighting = {
  id: 2,
  name: "Kaikoura, NZ",
  lat: -42.4,
  lng: 173.68,
  count: 61,
  accent: "#6ea8ff",
  case_slug: null,
};

const mockBootstrap: Bootstrap = {
  archives: [],
  boards: [],
  stats: {
    records: 91808,
    archives: 15,
    countries: 12,
    videos: 195,
    onlineNow: 1245,
    threads: 4153,
    postsToday: 8821,
    yearsCovered: 82,
    byDecade: [
      ["1940s", 612],
      ["1950s", 2140],
      ["2020s", 5602],
    ],
    topLocations: [
      ["United States", 38210],
      ["France", 3343],
    ],
  },
  ticker: [],
  sightings: [roswell, kaikoura],
  cases: [],
};

function renderMap() {
  return render(
    <MemoryRouter initialEntries={["/map"]}>
      <Routes>
        <Route path="/map" element={<MapScreen />} />
        <Route path="/case/:slug" element={<div data-testid="case-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockToast.mockReset();
  mockNavigate.mockReset();
  useBootstrapMock.mockReset();
  useBootstrapMock.mockReturnValue({ data: mockBootstrap, isLoading: false });
});

describe("project", () => {
  it("projects Roswell's lat/lng to the prototype's stored map-point x/y", () => {
    const { x, y } = project(33.39, -104.52);
    expect(x).toBeCloseTo(0.2097, 3);
    expect(y).toBeCloseTo(0.3145, 3);
  });

  it("projects the equator/prime-meridian origin to the map's exact center", () => {
    expect(project(0, 0)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("Map", () => {
  it("renders one dot per sighting", () => {
    renderMap();
    expect(screen.getByTitle("Roswell, NM")).toBeInTheDocument();
    expect(screen.getByTitle("Kaikoura, NZ")).toBeInTheDocument();
  });

  it("tapping a dot with a case_slug navigates to /case/:slug", () => {
    renderMap();
    fireEvent.click(screen.getByTitle("Roswell, NM"));
    expect(mockNavigate).toHaveBeenCalledWith("/case/roswell");
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("tapping a dot without a case_slug shows a toast instead of navigating", () => {
    renderMap();
    fireEvent.click(screen.getByTitle("Kaikoura, NZ"));
    expect(mockToast).toHaveBeenCalledWith("Kaikoura, NZ · 61 reports");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders the 4 stat tiles with their labels and numbers", () => {
    renderMap();
    expect(screen.getByText("Records")).toBeInTheDocument();
    expect(screen.getByText("91,808")).toBeInTheDocument();
    expect(screen.getByText("Videos")).toBeInTheDocument();
    expect(screen.getByText("195")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getByText("4,153")).toBeInTheDocument();
    expect(screen.getByText("Posts today")).toBeInTheDocument();
    expect(screen.getByText("8,821")).toBeInTheDocument();
  });

  it("renders the records-by-decade bars", () => {
    const { container } = renderMap();
    expect(screen.getByText("◆ Records by decade")).toBeInTheDocument();
    expect(screen.getByText("1940s")).toBeInTheDocument();
    expect(screen.getByText("2020s")).toBeInTheDocument();
    // the bar's title carries the raw count (prototype line 332's `title="{{ d.n }}"`).
    expect(container.querySelector('[title="612"]')).toBeInTheDocument();
  });

  it("renders the top-locations bars with visible labels and counts", () => {
    renderMap();
    expect(screen.getByText("◆ Top locations")).toBeInTheDocument();
    expect(screen.getByText("United States")).toBeInTheDocument();
    expect(screen.getByText("38210")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("3343")).toBeInTheDocument();
  });

  it("does not crash while bootstrap is still loading (defaults sightings/byDecade/topLocations to [])", () => {
    useBootstrapMock.mockReturnValue({ data: undefined, isLoading: true });
    renderMap();
    expect(screen.queryByTitle("Roswell, NM")).not.toBeInTheDocument();
  });
});
