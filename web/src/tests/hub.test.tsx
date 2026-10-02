import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Hub as HubData, HubSummary } from "../api/types";
import Hub from "../screens/Hub";
import Browse from "../screens/Browse";

const useHubMock = vi.fn();
const useHubsMock = vi.fn();
vi.mock("../api/queries", () => ({
  useHub: (kind: string, slug: string) => useHubMock(kind, slug),
  useHubs: () => useHubsMock(),
  // DocCard reads bootstrap (archive labels); not under test here.
  useBootstrap: () => ({ data: undefined, isLoading: false }),
}));

const fbi: HubData = {
  kind: "agency", slug: "fbi", title: "FBI UAP files",
  intro: "5 declassified UAP files from the Federal Bureau of Investigation (FBI): 5 PDFs.",
  stats: { files: 1, pdf: 1, video: 0, image: 0, from: "2022", to: "2022" },
  records: [{
    id: "FBI-UAP-D002", archive: "wargov", agency: "FBI", title: "FBI-UAP-D002, FD-1057, Unresolved UAP Report", summary: "",
    kind: "pdf", redacted: 0, thumb: null, location: null, incident_date: "2022", doc_date: null,
  }],
  siblings: [{ kind: "agency", slug: "cia", label: "CIA", count: 22 }],
};
const hubs: HubSummary[] = [
  { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
  { kind: "agency", slug: "fbi", label: "FBI", count: 104 },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/agency/:slug" element={<Hub kind="agency" />} />
        <Route path="/release/:slug" element={<Hub kind="release" />} />
        <Route path="/browse" element={<Browse />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useHubMock.mockReset();
  useHubsMock.mockReset();
});

describe("Hub", () => {
  it("renders title, intro, file cards and sibling hubs", () => {
    useHubMock.mockReturnValue({ data: fbi, isLoading: false });
    const { container } = renderAt("/agency/fbi");
    expect(useHubMock).toHaveBeenCalledWith("agency", "fbi");
    expect(screen.getByRole("heading", { level: 1, name: "FBI UAP files" })).toBeInTheDocument();
    expect(screen.getByText(fbi.intro)).toBeInTheDocument();
    expect(container.querySelector('a[href^="/doc/FBI-UAP-D002"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "CIA · 22" })).toHaveAttribute("href", "/agency/cia");
  });

  it("release hubs link prev/next", () => {
    useHubMock.mockReturnValue({ data: { ...fbi, kind: "release", slug: "5", title: "Release 05", prev: "4", next: "6" }, isLoading: false });
    renderAt("/release/5");
    expect(screen.getByRole("link", { name: "← RELEASE 04" })).toHaveAttribute("href", "/release/4");
    expect(screen.getByRole("link", { name: "RELEASE 06 →" })).toHaveAttribute("href", "/release/6");
  });

  it("shows not found for a missing hub", () => {
    useHubMock.mockReturnValue({ data: undefined, isLoading: false });
    renderAt("/agency/nope");
    expect(screen.getByText("hub not found.")).toBeInTheDocument();
  });
});

describe("Browse", () => {
  it("groups hubs by kind and skips empty kinds", () => {
    useHubsMock.mockReturnValue({ data: { hubs }, isLoading: false });
    renderAt("/browse");
    expect(screen.getByRole("heading", { name: "RELEASES" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AGENCIES" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "DECADES" })).toBeNull();
    expect(screen.getByRole("link", { name: "Release 06 · 18 Sep 2026 · 74" })).toHaveAttribute("href", "/release/6");
  });
});
