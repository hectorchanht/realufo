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
const mockVoteMutate = vi.fn();

vi.mock("../api/queries", () => ({
  useThread: (id: string) => useThreadMock(id),
  useVote: () => ({ mutate: mockVoteMutate, isPending: false }),
  useRecord: (id: string) => ({
    data:
      id === "NASA-UAP-D030"
        ? {
            record: { id, kind: "image", title: "NASA-UAP-D030, STS-80 Image 1" },
            assets: [
              { role: "full", cdn_url: "https://cdn.example/d030.jpg", mime: "image/jpeg" },
              { role: "thumb", cdn_url: "https://cdn.example/d030-thumb.jpg", mime: "image/jpeg" },
            ],
          }
        : undefined,
  }),
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
  mockVoteMutate.mockReset();
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
    const link = screen.getByRole("link", { name: /CIA-UAP-017 — Odd radar contact near Roswell/ });
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

  it("OP vote shows + toggles the thread's vote count (same counter as the board row)", () => {
    useThreadMock.mockReturnValue({
      data: {
        ...mockThreadDetail,
        thread: { ...mockThreadDetail.thread, votes: 7 },
        posts: mockThreadDetail.posts.map((p) => (p.isOp ? { ...p, votes: 1 } : p)),
      },
      isLoading: false,
    });
    renderThread();
    const op = screen.getByRole("button", { name: "vote (7)" });
    fireEvent.click(op);
    expect(mockVoteMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" });
    // replies keep their own per-post counter
    expect(screen.getByRole("button", { name: "vote (2)" })).toBeInTheDocument();
  });

  it('clicking the sticky "Post a reply" bar opens the composer in reply mode for this thread', () => {
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: /Post a reply/i }));
    expect(mockOpenComposer).toHaveBeenCalledWith({ mode: "reply", threadId: "th1" });
  });

  it("clicking a post's source-record thumb opens the media viewer for that record", () => {
    renderThread();
    fireEvent.click(screen.getByRole("button", { name: /open Odd radar contact near Roswell/i }));
    expect(mockOpenViewer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "doc", label: "Odd radar contact near Roswell" }),
    );
  });

  it("turns record ids in a post body into links with inline media (once per id)", () => {
    const body = "See NASA-UAP-D030 and again NASA-UAP-D030, but not NASA-UAP-D999 or nasa-uap-d030.";
    useThreadMock.mockReturnValue({
      data: { ...mockThreadDetail, posts: [{ ...mockThreadDetail.posts[1], body }] },
      isLoading: false,
    });
    renderThread();
    const links = screen.getAllByRole("link", { name: "NASA-UAP-D030" });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/doc/NASA-UAP-D030");
    expect(screen.queryByRole("link", { name: "NASA-UAP-D999" })).toBeNull();
    const embed = screen.getByRole("button", { name: "open NASA-UAP-D030" });
    expect(embed.querySelector("img")).toHaveAttribute("src", "https://cdn.example/d030-thumb.jpg");
    fireEvent.click(embed);
    expect(mockOpenViewer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", url: "https://cdn.example/d030.jpg" }),
    );
  });

  it("a record moment (ID@m:ss.cc) links to the doc at that time", () => {
    useThreadMock.mockReturnValue({
      data: { ...mockThreadDetail, posts: [{ ...mockThreadDetail.posts[1], body: "Watch NASA-UAP-D030@1:23.04 closely." }] },
      isLoading: false,
    });
    renderThread();
    expect(screen.getByRole("link", { name: "NASA-UAP-D030@1:23.04" })).toHaveAttribute("href", "/doc/NASA-UAP-D030?t=83.04");
  });

  it("turns URLs into external links, trimming trailing punctuation; record ids inside URLs stay in the link", () => {
    const body = "See https://uaplocations.com/uap/NASA-UAP-D030-x/. Also NASA-UAP-D030.";
    useThreadMock.mockReturnValue({
      data: { ...mockThreadDetail, posts: [{ ...mockThreadDetail.posts[1], body }] },
      isLoading: false,
    });
    renderThread();
    const a = screen.getByRole("link", { name: "https://uaplocations.com/uap/NASA-UAP-D030-x/" });
    expect(a).toHaveAttribute("href", "https://uaplocations.com/uap/NASA-UAP-D030-x/");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a.getAttribute("rel")).toContain("nofollow");
    expect(screen.getAllByRole("link", { name: "NASA-UAP-D030" })).toHaveLength(1);
  });

  it("renders a user-uploaded post image and opens it in the image viewer", () => {
    useThreadMock.mockReturnValue({
      data: { ...mockThreadDetail, posts: [{ ...mockThreadDetail.posts[1], image_kind: "upload", image_url: "/api/u/a.png" }] },
      isLoading: false,
    });
    renderThread();
    const btn = screen.getByRole("button", { name: "open attached image" });
    expect(btn.querySelector("img")).toHaveAttribute("src", "/api/u/a.png");
    fireEvent.click(btn);
    expect(mockOpenViewer).toHaveBeenCalledWith(expect.objectContaining({ kind: "image", url: "/api/u/a.png" }));
  });

  it("an OP that references a record AND has an uploaded image shows the uploaded image", () => {
    useThreadMock.mockReturnValue({
      data: { ...mockThreadDetail, posts: [{ ...mockThreadDetail.posts[0], image_kind: "upload", image_url: "/api/u/a.png" }] },
      isLoading: false,
    });
    renderThread();
    expect(screen.getByRole("button", { name: "open attached image" }).querySelector("img")).toHaveAttribute("src", "/api/u/a.png");
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
