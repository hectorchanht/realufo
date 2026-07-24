// Boards + Board screen tests (Task 20). `useBootstrap`/`useBoardThreads` are
// mocked at the api/queries module boundary (same convention as
// tests/doc.test.tsx — this also stubs ThreadRow's VoteButton's internal
// `useVote()` call, since it imports from the same module) as `vi.fn()`
// wrappers so individual tests can override the return value. `useOverlay`
// is mocked at the overlays/OverlayProvider module boundary so
// `openComposer` can be spied on directly, without needing a real
// OverlayProvider/OverlayHost tree.
//
// Rendered with a minimal MemoryRouter + Routes (not the full renderAppAt/
// AppShell tree tests/util.tsx provides for other screens) — matches the
// task brief ("Render within providers + MemoryRouter").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Board, BoardThreadsResponse, Bootstrap, ThreadCard } from "../api/types";
import Boards from "../screens/Boards";
import BoardScreen from "../screens/Board";

const mockOpenComposer = vi.fn();

vi.mock("../overlays/OverlayProvider", () => ({
  useOverlay: () => ({ openComposer: mockOpenComposer, openViewer: vi.fn() }),
}));

const useBootstrapMock = vi.fn();
const useBoardThreadsMock = vi.fn();

vi.mock("../api/queries", () => ({
  useBootstrap: () => useBootstrapMock(),
  useBoardThreads: (id: string) => useBoardThreadsMock(id),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
}));

// 7 boards, deliberately using an `id` that does NOT match the bare slug
// (e.g. "board-1" vs slug "/uap/") so a passing test proves slug->board
// resolution really matches on `slug`, not a lucky `id === bareSlug` coincidence.
const mockBoards: Board[] = [
  { id: "board-1", slug: "/uap/", name: "UAP Central", desc: "General sightings & discussion", accent: "#9184d9", icon: "🛸", online: 42, thread_count: 128 },
  { id: "board-2", slug: "/gov/", name: "Gov & FOIA", desc: "Declassified docs & leaks", accent: "#6ea8ff", icon: "📄", online: 18, thread_count: 76 },
  { id: "board-3", slug: "/contact/", name: "Contact Claims", desc: "Firsthand encounters", accent: "#f2b84b", icon: "👽", online: 9, thread_count: 54 },
  { id: "board-4", slug: "/tech/", name: "Tech & Propulsion", desc: "Reverse engineering theories", accent: "#5ad1c0", icon: "🛠", online: 5, thread_count: 33 },
  { id: "board-5", slug: "/skeptics/", name: "Skeptics Corner", desc: "Debunking & analysis", accent: "#e06a6a", icon: "🔬", online: 11, thread_count: 22 },
  { id: "board-6", slug: "/abductions/", name: "Abductions", desc: "Missing time reports", accent: "#c98bd9", icon: "🌀", online: 3, thread_count: 15 },
  { id: "board-7", slug: "/cases/", name: "Cold Cases", desc: "Unsolved historic incidents", accent: "#8fd15a", icon: "🗂", online: 7, thread_count: 41 },
];

const mockBootstrap: Bootstrap = {
  archives: [],
  boards: mockBoards,
  stats: {
    records: 0,
    archives: 0,
    countries: 0,
    videos: 0,
    onlineNow: 0,
    threads: 0,
    postsToday: 0,
    yearsCovered: 0,
    byDecade: [],
    topLocations: [],
  },
  ticker: [],
  sightings: [],
  cases: [],
};

const mockThreads: ThreadCard[] = [
  {
    id: "th1",
    no: 5,
    board_id: "board-1",
    boardSlug: "/uap/",
    accent: "#9184d9",
    title: "Anyone else see this over the coast last night?",
    op_body: "Three lights in formation, no sound at all.",
    stance: "believer",
    reply_count: 4,
    img_count: 1,
    votes: 9,
    hot: 1,
    ago: "3h",
  },
  {
    id: "th2",
    no: 6,
    board_id: "board-1",
    boardSlug: "/uap/",
    accent: "#9184d9",
    title: "Radar contact near restricted airspace",
    op_body: "Anyone have more info on this one?",
    stance: "analyst",
    reply_count: 2,
    img_count: 0,
    votes: 3,
    hot: 0,
    ago: "1d",
  },
];

const mockBoardThreadsResponse: BoardThreadsResponse = {
  board: mockBoards[0],
  threads: mockThreads,
};

function renderBoards() {
  return render(
    <MemoryRouter initialEntries={["/boards"]}>
      <Routes>
        <Route path="/boards" element={<Boards />} />
        <Route path="/board/:slug" element={<div data-testid="board-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderBoard(path = "/board/uap") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/board/:slug" element={<BoardScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockOpenComposer.mockReset();
  useBootstrapMock.mockReset();
  useBoardThreadsMock.mockReset();
  useBootstrapMock.mockReturnValue({ data: mockBootstrap, isLoading: false });
  useBoardThreadsMock.mockReturnValue({ data: mockBoardThreadsResponse, isLoading: false });
});

describe("Boards", () => {
  it("renders all 7 boards from bootstrap", () => {
    renderBoards();
    for (const b of mockBoards) {
      expect(screen.getByText(b.name)).toBeInTheDocument();
    }
  });

  it("a BoardRow links to /board/:slug (slashes stripped from the API slug)", () => {
    renderBoards();
    const link = screen.getByText("UAP Central").closest("a");
    expect(link).toHaveAttribute("href", "/board/uap");
  });

  it('clicking the "NEW" tile opens the composer in newThread mode for the uap board', () => {
    renderBoards();
    fireEvent.click(screen.getByRole("button", { name: /NEW/i }));
    expect(mockOpenComposer).toHaveBeenCalledWith({ mode: "newThread", boardId: "uap" });
  });

  it("does not crash while bootstrap is still loading (static CTA copy still renders, no board rows yet)", () => {
    useBootstrapMock.mockReturnValue({ data: undefined, isLoading: true });
    renderBoards();
    expect(screen.getByText(/POST ANONYMOUSLY/)).toBeInTheDocument();
    expect(screen.queryByText("UAP Central")).not.toBeInTheDocument();
  });
});

describe("Board", () => {
  it("resolves the board whose slash-wrapped slug matches the bare route param and shows its name + desc line", () => {
    renderBoard("/board/uap");
    expect(screen.getByText("UAP Central")).toBeInTheDocument();
    expect(screen.getByText(/128 threads · General sightings & discussion/)).toBeInTheDocument();
  });

  it('clicking "START A NEW THREAD" opens the composer in newThread mode with the resolved board\'s id', () => {
    renderBoard("/board/uap");
    fireEvent.click(screen.getByRole("button", { name: /start a new thread/i }));
    expect(mockOpenComposer).toHaveBeenCalledWith({ mode: "newThread", boardId: "board-1" });
    expect(useBoardThreadsMock).toHaveBeenCalledWith("board-1");
  });

  it("renders the board's threads", () => {
    renderBoard("/board/uap");
    expect(screen.getByText(/Anyone else see this over the coast last night/)).toBeInTheDocument();
    expect(screen.getByText(/Radar contact near restricted airspace/)).toBeInTheDocument();
  });

  it("shows a simple not-found state when the slug matches no board", () => {
    renderBoard("/board/doesnotexist");
    expect(screen.getByText(/board not found/i)).toBeInTheDocument();
    expect(screen.queryByText("UAP Central")).not.toBeInTheDocument();
  });

  it("does not crash while bootstrap is still loading (no board resolved yet)", () => {
    useBootstrapMock.mockReturnValue({ data: undefined, isLoading: true });
    renderBoard("/board/uap");
    expect(screen.queryByText(/board not found/i)).not.toBeInTheDocument();
  });
});
