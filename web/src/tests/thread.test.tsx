// Thread (thread detail) screen tests (Task 21). `useThread` is mocked at the
// api/queries module boundary (same convention as tests/doc.test.tsx /
// tests/boards.test.tsx — this also stubs VoteButton's internal `useVote()`
// call, since it imports from the same module) as a `vi.fn()` wrapper so
// individual tests can override the return value. `useOverlay` is mocked at
// the overlays/OverlayProvider module boundary so `openComposer`/
// `openViewer` can be spied on directly, without needing a real
// OverlayProvider/OverlayHost tree.
//
// Rendered with a minimal MemoryRouter + Routes (not the full renderAppAt/
// AppShell tree tests/util.tsx provides for other screens) — matches the
// task brief ("Render within providers + MemoryRouter at /thread/:id").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { ThreadDetail } from "../api/types";
import Thread from "../screens/Thread";

const mockOpenComposer = vi.fn();
const mockOpenViewer = vi.fn();

vi.mock("../overlays/OverlayProvider", () => ({
  useOverlay: () => ({ openComposer: mockOpenComposer, openViewer: mockOpenViewer }),
}));

const useThreadMock = vi.fn();

vi.mock("../api/queries", () => ({
  useThread: (id: string) => useThreadMock(id),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockThreadDetail: ThreadDetail = {
  thread: {
    id: "th1",
    no: 42,
    board_id: "board-1",
    boardSlug: "/uap/",
    accent: "#9184d9",
    title: "Was this radar contact ever explained?",
    op_body: "Cross-posting the file — anyone have follow-up?",
    stance: "analyst",
    reply_count: 1,
    img_count: 1,
    votes: 5,
    hot: 1,
    ago: "3h",
    tags: [],
    op_handle: null,
    op_id: "op1",
    mins: null,
    source_record_id: "rec9",
    case_slug: null,
    created_at: "2024-01-01",
  },
  sourceRecord: {
    id: "rec9",
    agency: "CIA",
    title: "CIA-UAP-017, Odd radar contact near Roswell",
    kind: "pdf",
    thumb: "https://cdn.example/rec9-thumb.jpg",
  },
  posts: [
    {
      id: "op1",
      no: 42,
      thread_id: "th1",
      body: "Cross-posting the file — anyone have follow-up?",
      handle: null,
      stance: "analyst",
      votes: 5,
      source_record_id: "rec9",
      image_kind: null,
      image_label: null,
      reply_to: [],
      is_op: 1,
      isOp: true,
      created_at: "2024-01-01",
      ago: "3h",
      handleShow: null,
    },
    {
      id: "post2",
      no: 43,
      thread_id: "th1",
      body: "I saw the same radar anomaly reported in a different FOIA batch.",
      handle: "watcher",
      stance: "believer",
      votes: 2,
      source_record_id: null,
      image_kind: null,
      image_label: null,
      reply_to: [],
      is_op: 0,
      isOp: false,
      created_at: "2024-01-02",
      ago: "1h",
      handleShow: "!watcher",
    },
  ],
};

function renderThread(path = "/thread/th1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/thread/:id" element={<Thread />} />
        <Route path="/doc/:id" element={<div data-testid="doc-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockOpenComposer.mockReset();
  mockOpenViewer.mockReset();
  useThreadMock.mockReset();
  useThreadMock.mockReturnValue({ data: mockThreadDetail, isLoading: false });
});

describe("Thread", () => {
  it("renders the board slug + No. and the thread title", () => {
    renderThread();
    expect(screen.getByText("/uap/")).toBeInTheDocument();
    expect(screen.getByText("No.42")).toBeInTheDocument();
    expect(screen.getByText("Was this radar contact ever explained?")).toBeInTheDocument();
  });

  it('renders the "◂ from record" source back-reference chip linking to /doc/:id', () => {
    renderThread();
    const link = screen.getByRole("link", { name: /CIA-UAP-017, Odd radar contact near Roswell/ });
    expect(link).toHaveAttribute("href", "/doc/rec9");
  });

  it("shows the OP badge on the OP post and renders a non-OP post's body", () => {
    renderThread();
    expect(screen.getByText("OP")).toBeInTheDocument();
    expect(
      screen.getByText(/I saw the same radar anomaly reported in a different FOIA batch/),
    ).toBeInTheDocument();
    expect(screen.getByText("!watcher")).toBeInTheDocument();
  });

  it('clicking the sticky "Post a reply" bar opens the composer in reply mode for this thread', () => {
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: /Post a reply/i }));
    expect(mockOpenComposer).toHaveBeenCalledWith({ mode: "reply", threadId: "th1" });
  });

  it("clicking a post's source-record thumb opens the media viewer for that record", () => {
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: /open CIA-UAP-017, Odd radar contact near Roswell/i }));
    expect(mockOpenViewer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "doc", label: "CIA-UAP-017, Odd radar contact near Roswell" }),
    );
  });

  it("shows a loading state while the thread is loading (never indexes into undefined)", () => {
    useThreadMock.mockReturnValue({ data: undefined, isLoading: true });
    renderThread();
    expect(screen.getByText(/loading signal/i)).toBeInTheDocument();
  });

  it("shows a simple not-found state when the thread is missing", () => {
    useThreadMock.mockReturnValue({ data: undefined, isLoading: false });
    renderThread();
    expect(screen.getByText(/thread not found/i)).toBeInTheDocument();
  });
});
