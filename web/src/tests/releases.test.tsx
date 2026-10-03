import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Releases from "../screens/Releases";

const useReleasesMock = vi.fn();
vi.mock("../api/queries", () => ({ useReleases: () => useReleasesMock() }));

const data = {
  series: [
    { no: 1, date: "2026-05-08", weekday: "Friday", files: 169, gap: null, agencies: [{ label: "Department of War", slug: "department-of-war", count: 160 }], kinds: { pdf: 100, video: 69, image: 0 }, newAgencies: [] },
    { no: 2, date: "2026-05-22", weekday: "Friday", files: 56, gap: 14, agencies: [{ label: "CIA", slug: "cia", count: 56 }], kinds: { pdf: 56, video: 0, image: 0 }, newAgencies: ["CIA"] },
  ],
  window: { next: 3, earliest: "2026-06-05", likely: "2026-06-05", latest: "2026-06-05", state: "ahead", daysSince: 3, shortestGap: 14, longestGap: 14, medianGap: 14, sameWeekday: "Friday" },
  status: { headline: "Release 03: no date announced. If the pattern holds: Fri 5 Jun 2026, most likely around Fri 5 Jun.", basis: "Based on the gaps between past releases: 14 days. Every release so far landed on a Friday." },
  faq: [{ q: "Where do the UFO files come from?", a: "The U.S. Department of War publishes them at war.gov/UFO.", link: { href: "https://www.war.gov/UFO/", text: "war.gov/UFO" } }],
};

describe("Releases screen", () => {
  beforeEach(() => useReleasesMock.mockReturnValue({ data, isLoading: false }));

  it("shows the status, table (newest first) and FAQ", () => {
    render(<MemoryRouter><Releases /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pentagon UFO File Releases: Dates, Schedule & Next Release");
    expect(screen.getByText(data.status.headline)).toBeInTheDocument();
    expect(screen.getByText(data.status.basis)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Release 02");
    expect(screen.getByRole("link", { name: "Release 01" }).getAttribute("href")).toBe("/release/1");
    expect(screen.getByText("Where do the UFO files come from?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "war.gov/UFO" }).getAttribute("href")).toBe("https://www.war.gov/UFO/");
  });

  it("error state instead of an endless loading line", () => {
    useReleasesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<MemoryRouter><Releases /></MemoryRouter>);
    expect(screen.queryByText(/loading signal/i)).not.toBeInTheDocument();
    expect(screen.getByText(/release data unavailable/i)).toBeInTheDocument();
  });

  it("loading state", () => {
    useReleasesMock.mockReturnValue({ data: undefined, isLoading: true });
    render(<MemoryRouter><Releases /></MemoryRouter>);
    expect(screen.getByText(/loading signal/i)).toBeInTheDocument();
  });
});
