import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Hub as HubData, HubSummary } from "../api/types";
import Hub from "../screens/Hub";
import Browse from "../screens/Browse";
import { activeTabForPath } from "../components/navItems";

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

describe("nav tab for hub routes", () => {
  it("highlights Archive on /browse and every hub kind", () => {
    for (const p of ["/browse", "/release/6", "/agency/fbi", "/location/iraq", "/decade/1950s"]) {
      expect(activeTabForPath(p)).toBe("archive");
    }
    expect(activeTabForPath("/releases-notes")).toBe("feed");
  });
});

describe("hub highlights", () => {
  it("shows lede, linked picks and the AI footnote", () => {
    useHubMock.mockReturnValue({
      data: {
        ...fbi,
        highlights: {
          lede: "Five FBI reports. Two describe triangles.",
          picks: [
            { id: "FBI-UAP-D002", why: "Pilot saw a triangle.", title: "FBI-UAP-D002, FD-1057, Unresolved UAP Report", thumb: null, kind: "pdf" },
            { id: "FBI-UAP-D003", why: "A rendering.", title: "FBI-UAP-D003, Rendering", thumb: null, kind: "pdf" },
          ],
        },
      },
      isLoading: false,
    });
    renderAt("/agency/fbi");
    expect(screen.getByRole("heading", { name: "WHAT STANDS OUT" })).toBeTruthy();
    expect(screen.getByText("Five FBI reports. Two describe triangles.")).toBeTruthy();
    expect(screen.getByText("Pilot saw a triangle.").closest("a")!.getAttribute("href")).toBe("/doc/FBI-UAP-D002");
    expect(screen.getByText("AI-written from the file summaries")).toBeTruthy();
  });

  it("renders nothing when highlights are null", () => {
    useHubMock.mockReturnValue({ data: { ...fbi, highlights: null }, isLoading: false });
    renderAt("/agency/fbi");
    expect(screen.queryByText("WHAT STANDS OUT")).toBeNull();
  });
});

const release6: HubData = {
  kind: "release", slug: "6", title: "Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files",
  intro: "74 declassified UAP files the Department of War published on 18 September 2026 (Release 06): 4 PDFs, 70 videos.",
  stats: { files: 74, pdf: 4, video: 70, image: 0, from: "1950", to: "2025" },
  records: [], siblings: [], prev: "5", next: null, highlights: null,
  release: {
    info: { no: 6, date: "2026-09-18", weekday: "Friday", files: 74, gap: 42,
      agencies: [{ label: "Department of War", slug: "department-of-war", count: 70 }, { label: "Local law enforcement", slug: "local-law-enforcement", count: 4 }],
      kinds: { pdf: 4, video: 70, image: 0 }, newAgencies: ["Local law enforcement"] },
    size: "74 files, +33 on Release 05", kinds: "70 videos, 4 PDFs",
    prev: { no: 5, date: "2026-08-07" }, next: null, upcoming: "Release 07: due any day",
    faq: [{ q: "When was Release 06 published?", a: "On Friday, 18 September 2026." }],
  },
};

describe("release hub blocks", () => {
  it("renders what's new, dated nav, tracker link and FAQ", () => {
    useHubMock.mockReturnValue({ data: release6, isLoading: false });
    renderAt("/release/6");
    expect(screen.getByRole("heading", { name: "WHAT'S NEW IN RELEASE 06" })).toBeInTheDocument();
    expect(screen.getByText("74 files, +33 on Release 05")).toBeInTheDocument();
    expect(screen.getByText("First release with files from Local law enforcement")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Department of War 70" }).getAttribute("href")).toBe("/agency/department-of-war");
    expect(screen.getByRole("link", { name: "← RELEASE 05 (7 Aug)" }).getAttribute("href")).toBe("/release/5");
    expect(screen.getByRole("link", { name: "Release 07: due any day →" }).getAttribute("href")).toBe("/releases");
    expect(screen.getByText("When was Release 06 published?")).toBeInTheDocument();
  });

  it("agency hubs render no release blocks", () => {
    useHubMock.mockReturnValue({ data: fbi, isLoading: false });
    renderAt("/agency/fbi");
    expect(screen.queryByText(/WHAT'S NEW/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "FAQ" })).not.toBeInTheDocument();
  });
});
