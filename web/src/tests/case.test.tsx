// Cold Case (Case) screen tests (Task 22). `useCase` is mocked at the
// api/queries module boundary (same convention as tests/thread.test.tsx) as a
// `vi.fn()` wrapper so individual tests can override the return value.
// Rendered with a minimal MemoryRouter + Routes (matches the task brief's
// "Render within providers + MemoryRouter at /case/:slug" and the sibling
// Thread screen's own test convention).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { CaseDetail } from "../api/types";
import Case from "../screens/Case";

const useCaseMock = vi.fn();

vi.mock("../api/queries", () => ({
  useCase: (slug: string) => useCaseMock(slug),
}));

// roswell-like fixture (realufo-handoff/data.js's "roswell" cold case),
// with a non-empty `status` and a `relatedThread` added so both conditional
// branches (status-amber + ACTIVE DISCUSSION card) have something to assert.
const roswellCase: CaseDetail = {
  case: {
    slug: "roswell",
    name: "Roswell · Project Mogul",
    archive: "nara",
    archive_label: "NARA Archive",
    accent: "#cbd5e1",
    coord: "◉ 33.3940° N · 104.5230° W · Brazel Ranch, NM · 5–8 Jul 1947",
    lede:
      "On 8 July 1947, the public information officer of the 509th Bomb Group, Roswell Army Airfield (RAAF), Lt. Walter Haut, issued a press release.",
    pull: "The 509th Bomb Group of the Eighth Air Force, Roswell Army Air Field, was fortunate enough to gain possession of a disc.",
    pull_cite: "— Lt. Walter G. Haut, RAAF PIO press release, 8 July 1947 · 09:30",
    status: "USAF: Project Mogul · case formally closed",
  },
  relatedThread: {
    id: "t5",
    title: "Roswell debris field — anyone mapped the actual GPS coords from the '94 report?",
    boardSlug: "cases",
    accent: "#7dd3fc",
    ago: "1h",
  },
};

// socorro-like fixture with no `pull` and no `relatedThread`.
const socorroCase: CaseDetail = {
  case: {
    slug: "socorro",
    name: "Socorro Landing",
    archive: "nara",
    archive_label: "NARA Archive",
    accent: "#9184d9",
    coord: "◉ 34.0570° N · 106.9000° W · Socorro, NM · 24 Apr 1964",
    lede: "Police officer Lonnie Zamora reported a landed egg-shaped craft and two small figures southwest of Socorro.",
    pull: "",
    pull_cite: "",
    status: "",
  },
  relatedThread: null,
};

function renderCase(path = "/case/roswell") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/case/:slug" element={<Case />} />
        <Route path="/thread/:id" element={<div data-testid="thread-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useCaseMock.mockReset();
  useCaseMock.mockReturnValue({ data: roswellCase, isLoading: false });
});

describe("Case", () => {
  it("renders the coord line, name, and lede", () => {
    renderCase();
    expect(screen.getByText(roswellCase.case.coord)).toBeInTheDocument();
    expect(screen.getByText("Roswell · Project Mogul")).toBeInTheDocument();
    expect(screen.getByText(roswellCase.case.lede)).toBeInTheDocument();
  });

  it("renders the archive label and status", () => {
    renderCase();
    expect(screen.getByText(/NARA Archive/)).toBeInTheDocument();
    expect(screen.getByText("USAF: Project Mogul · case formally closed")).toBeInTheDocument();
  });

  it("renders the pull-quote blockquote with citation when pull is present", () => {
    renderCase();
    expect(screen.getByText(`“${roswellCase.case.pull}”`)).toBeInTheDocument();
    expect(screen.getByText(roswellCase.case.pull_cite)).toBeInTheDocument();
  });

  it("renders the ACTIVE DISCUSSION card linking to /thread/:id", () => {
    renderCase();
    expect(screen.getByText(/ACTIVE DISCUSSION · cases/)).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /Roswell debris field — anyone mapped the actual GPS coords from the '94 report\?/,
    });
    expect(link).toHaveAttribute("href", "/thread/t5");
  });

  it("omits the pull-quote blockquote when pull is empty", () => {
    useCaseMock.mockReturnValue({ data: socorroCase, isLoading: false });
    const { container } = renderCase("/case/socorro");
    expect(container.querySelector("blockquote")).not.toBeInTheDocument();
    expect(screen.getByText("Socorro Landing")).toBeInTheDocument();
  });

  it("omits the ACTIVE DISCUSSION card when relatedThread is null", () => {
    useCaseMock.mockReturnValue({ data: socorroCase, isLoading: false });
    renderCase("/case/socorro");
    expect(screen.queryByText(/ACTIVE DISCUSSION/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a loading state while the case is loading (never indexes into undefined)", () => {
    useCaseMock.mockReturnValue({ data: undefined, isLoading: true });
    renderCase();
    expect(screen.getByText(/loading signal/i)).toBeInTheDocument();
  });

  it("shows a simple not-found state when the case is missing", () => {
    useCaseMock.mockReturnValue({ data: undefined, isLoading: false });
    renderCase();
    expect(screen.getByText(/case not found/i)).toBeInTheDocument();
  });
});
