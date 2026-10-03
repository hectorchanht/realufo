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
// Real places (bootstrap `places[]`, counted from record locations) render
// as dots; tapping one opens the in-map panel that lists its files via
// `useRecords({ location: values })`. Curated case pins (`sightings[]`) stay a
// separate marker that navigates to /case/:slug.
//
// Fixture values (Roswell's lat/lng, the byDecade/topLocations pairs) are
// taken from realufo-handoff/data.js's `mapPoints`/`stats` so the `project()`
// assertion below can be checked directly against the prototype's own
// precomputed `x`/`y` (data.js's Roswell entry: x:0.20966666666666667,
// y:0.3145).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Bootstrap, MapPlace, Sighting } from "../api/types";
import { placesNear, project } from "../lib/map";
import MapScreen from "../screens/Map";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const useBootstrapMock = vi.fn();
const useRecordsMock = vi.fn();
vi.mock("../api/queries", () => ({
  useBootstrap: () => useBootstrapMock(),
  useRecords: (...a: unknown[]) => useRecordsMock(...a),
}));

// Curated case pin.
const roswell: Sighting = {
  id: 1,
  name: "Roswell, NM",
  lat: 33.39,
  lng: -104.52,
  accent: "#c8d0dc",
  case_slug: "roswell",
};

const western: MapPlace = {
  name: "Western United States",
  lat: 39.5,
  lng: -116.5,
  values: ["Western United States", "Westen United States"],
  count: 56,
  hub: "western-united-states",
};
const harare: MapPlace = { name: "Harare, Zimbabwe", lat: -17.83, lng: 31.05, values: ["Harare, Zimbabwe"], count: 1, hub: null };
const moon: MapPlace = { name: "The Moon", lat: null, lng: null, values: ["Moon"], count: 8, hub: "moon" };

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
  sightings: [roswell],
  places: [western, moon, harare],
  unmappedFiles: 8,
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
  useRecordsMock.mockReset();
  useRecordsMock.mockReturnValue({ data: undefined, isLoading: true });
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

describe("placesNear", () => {
  const colorado: MapPlace = { name: "Colorado", lat: 39.0, lng: -105.5, values: ["Colorado"], count: 8, hub: null };
  const springs: MapPlace = { name: "Colorado Springs, Colorado", lat: 38.8, lng: -104.8, values: ["Colorado Springs, Colorado"], count: 8, hub: null };

  it("returns every dot under a tap, biggest first — overlapping dots stay reachable", () => {
    // 1080×540 box = 3px per degree; tap right on Colorado (Western US is 11° off).
    const hits = placesNear([harare, colorado, springs, western], (180 - 105.5) * 3, (90 - 39) * 3, 1080, 540);
    expect(hits.map((p) => p.name)).toEqual(["Colorado", "Colorado Springs, Colorado"]);
  });

  it("returns nothing for a tap on empty ocean", () => {
    expect(placesNear([harare, colorado], 10, 170, 360, 180)).toEqual([]);
  });
});

describe("Map", () => {
  it("renders one dot per real place, titled with its real file count", () => {
    renderMap();
    expect(screen.getByTitle("Western United States · 56 files")).toBeInTheDocument();
    expect(screen.getByTitle("Harare, Zimbabwe · 1 file")).toBeInTheDocument();
    expect(screen.getByText(/3 PLACES/)).toBeInTheDocument();
    expect(screen.getByText(/8 files without a map spot/)).toBeInTheDocument();
  });

  it("renders curated case pins that navigate to /case/:slug", () => {
    renderMap();
    fireEvent.click(screen.getByTitle("Case: Roswell, NM"));
    expect(mockNavigate).toHaveBeenCalledWith("/case/roswell");
  });

  it("puts off-world places in a chip instead of on the grid", () => {
    renderMap();
    expect(screen.getByRole("button", { name: /The Moon · 8/ })).toBeInTheDocument();
  });

  it("tapping a place opens the panel listing its files across all alias values", () => {
    useRecordsMock.mockReturnValue({
      data: { count: 56, records: [{ id: "DOW-1", title: "West file", agency: "DoW", archive: "wargov", kind: "pdf" }] },
      isLoading: false,
    });
    renderMap();
    expect(screen.queryByRole("region", { name: "Western United States" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Western United States · 56 files"));
    const panel = screen.getByRole("region", { name: "Western United States" });
    expect(useRecordsMock).toHaveBeenLastCalledWith(
      { location: ["Western United States", "Westen United States"], limit: 12 },
    );
    expect(panel).toHaveTextContent("West file");
    expect(screen.getByRole("link", { name: /See all 56/ })).toHaveAttribute("href", "/location/western-united-states");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Western United States" })).not.toBeInTheDocument();
  });

  it("lists places with a hub page as links, one per hub, biggest first", () => {
    const nevada: MapPlace = { name: "Nevada", lat: 39, lng: -117, values: ["Nevada"], count: 3, hub: "western-united-states" };
    useBootstrapMock.mockReturnValue({ data: { ...mockBootstrap, places: [nevada, harare, western, moon] }, isLoading: false });
    renderMap();
    const links = [...screen.getByRole("navigation", { name: "Places in the archive" }).querySelectorAll("a")];
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Western United States · 56", "/location/western-united-states"],
      ["The Moon · 8", "/location/moon"],
    ]);
  });

  it("a tap over overlapping dots lists them all to choose from", () => {
    const vegas: MapPlace = { name: "Las Vegas, Nevada", lat: 36.2, lng: -115.1, values: ["Las Vegas, Nevada"], count: 37, hub: null };
    useBootstrapMock.mockReturnValue({ data: { ...mockBootstrap, places: [western, vegas, harare] }, isLoading: false });
    const { container } = renderMap();
    const map = container.querySelector("[data-map]") as HTMLElement;
    map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 180 }) as DOMRect;
    // between Western US (-116.5, 39.5) and Las Vegas (-115.1, 36.2)
    fireEvent.click(map, { detail: 1, clientX: 180 - 116, clientY: 90 - 38 });
    const chooser = screen.getByRole("region", { name: "2 places here" });
    expect(chooser).toHaveTextContent("Western United States");
    expect(chooser).toHaveTextContent("Las Vegas, Nevada");
    fireEvent.click(within(chooser).getByRole("button", { name: /Las Vegas, Nevada/ }));
    expect(screen.getByRole("region", { name: "Las Vegas, Nevada" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "2 places here" })).not.toBeInTheDocument();
  });

  it("a place without a live hub links to the Archive filtered by its location", () => {
    renderMap();
    fireEvent.click(screen.getByTitle("Harare, Zimbabwe · 1 file"));
    expect(screen.getByRole("link", { name: /See all 1/ })).toHaveAttribute("href", "/archive?location=Harare%2C+Zimbabwe");
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
    expect(screen.queryByTitle("Case: Roswell, NM")).not.toBeInTheDocument();
  });
});
