// Doc (document detail) screen tests (Task 19). `useRecord`/`useComments`/
// `useRecords`/`useBootstrap` are mocked at the api/queries module boundary
// (same convention as tests/archive.test.tsx — this also stubs VoteButton's
// internal `useVote()` call, since it imports from the same module) as
// `vi.fn()` wrappers so individual tests can override the return value (the
// not-found case). `useOverlay` is mocked at the overlays/OverlayProvider
// module boundary so `openComposer`/`openViewer` can be spied on directly,
// without needing a real OverlayProvider/OverlayHost tree — Composer's own
// wiring is already covered end-to-end by tests/composer.test.tsx.
//
// Rendered with a minimal MemoryRouter + Routes (not the full
// renderAppAt/AppShell tree tests/util.tsx provides for other screens) since
// this suite only needs the `/doc/:id` param + a `/thread/:id` target for the
// promoted-thread link assertion, per the task brief ("Render within
// providers + MemoryRouter at /doc/:id").
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { CommentsResponse, RecordDetail, RecordsListResponse } from "../api/types";
import Doc from "../screens/Doc";

const mockOpenComposer = vi.fn();
const mockOpenViewer = vi.fn();

vi.mock("../overlays/OverlayProvider", () => ({
  useOverlay: () => ({ openComposer: mockOpenComposer, openViewer: mockOpenViewer }),
}));

const useRecordMock = vi.fn();
const useCommentsMock = vi.fn();
const useRecordsMock = vi.fn();
const useBootstrapMock = vi.fn();

vi.mock("../api/queries", () => ({
  useRecord: (id: string) => useRecordMock(id),
  useComments: (id: string) => useCommentsMock(id),
  useRecords: (params: Record<string, unknown>) => useRecordsMock(params),
  useBootstrap: () => useBootstrapMock(),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
}));

const mockDetail: RecordDetail = {
  record: {
    id: "rec1",
    archive: "wargov",
    agency: "CIA",
    agency_full: "Central Intelligence Agency",
    title: "CIA-UAP-017, Placement on High Alert near Roswell",
    summary: "A memo describing an unusual radar contact over restricted airspace.",
    incident_date: "1978-03-04",
    location: "Roswell, NM",
    doc_date: "1978-04-01",
    kind: "pdf",
    redacted: 0,
    featured: 0,
    virin: "DOD-1978-00417",
    source_url: null,
    source_site: null,
    retrieved_at: null,
    license: null,
    status: "live",
    checksum: null,
    created_at: "2024-01-01",
  },
  assets: [
    { role: "thumb", cdn_url: "https://cdn.example/thumb.jpg", mime: "image/jpeg", width: 400, height: 300 },
    { role: "full", cdn_url: "https://cdn.example/full.pdf", mime: "application/pdf", width: null, height: null },
  ],
  promotedThreads: [
    {
      id: "th1",
      no: 7,
      title: "Was this radar contact ever explained?",
      stance: "analyst",
      votes: 4,
      source_record_id: "rec1",
      boardSlug: "/uap/",
      accent: "#9184d9",
    },
  ],
};

const mockComments: CommentsResponse = {
  comments: [
    {
      id: "c1",
      no: 1,
      body: "This looks legit, cross-referenced with another FOIA release.",
      handle: null,
      stance: "believer",
      votes: 3,
      created_at: "2024-01-02",
      ago: "2h",
      handleShow: null,
    },
  ],
};

const emptyRecords: RecordsListResponse = { count: 0, records: [] };

function renderDoc(path = "/doc/rec1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/doc/:id" element={<Doc />} />
        <Route path="/thread/:id" element={<div data-testid="thread-page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockOpenComposer.mockReset();
  mockOpenViewer.mockReset();
  useRecordMock.mockReset();
  useCommentsMock.mockReset();
  useRecordsMock.mockReset();
  useBootstrapMock.mockReset();
  useRecordMock.mockReturnValue({ data: mockDetail, isLoading: false });
  useCommentsMock.mockReturnValue({ data: mockComments, isLoading: false });
  useRecordsMock.mockReturnValue({ data: emptyRecords, isLoading: false });
  useBootstrapMock.mockReturnValue({ data: undefined, isLoading: false });
});

describe("Doc", () => {
  it("renders the meta grid fields and the summary", () => {
    renderDoc();
    expect(screen.getByText("1978-03-04")).toBeInTheDocument();
    expect(screen.getByText("Roswell, NM")).toBeInTheDocument();
    expect(screen.getByText("1978-04-01")).toBeInTheDocument();
    expect(screen.getByText("DOD-1978-00417")).toBeInTheDocument();
    expect(screen.getByText(/unusual radar contact over restricted airspace/)).toBeInTheDocument();
  });

  it("renders a comment with its body", () => {
    renderDoc();
    expect(screen.getByText(/cross-referenced with another FOIA release/)).toBeInTheDocument();
  });

  it('clicking "Add your read on this file…" opens the composer in comment mode for this record', () => {
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /Add your read on this file/i }));
    expect(mockOpenComposer).toHaveBeenCalledWith(expect.objectContaining({ mode: "comment", recordId: "rec1" }));
  });

  it('clicking "⤴ to a board" opens the composer in newThread mode with sourceRecordId and a quoted presetBody', () => {
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /to a board/i }));

    expect(mockOpenComposer).toHaveBeenCalledTimes(1);
    const [opts] = mockOpenComposer.mock.calls[0];
    expect(opts.mode).toBe("newThread");
    expect(opts.sourceRecordId).toBe("rec1");
    expect(opts.presetBody).toContain("cross-referenced with another FOIA release");
  });

  it('clicking "◈ Start a board thread about this file" opens the composer in newThread mode with an empty body and a refLabel', () => {
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /Start a board thread about this file/i }));

    expect(mockOpenComposer).toHaveBeenCalledTimes(1);
    const [opts] = mockOpenComposer.mock.calls[0];
    expect(opts.mode).toBe("newThread");
    expect(opts.sourceRecordId).toBe("rec1");
    expect(opts.boardId).toBe("uap");
    expect(opts.presetBody).toBeUndefined();
    expect(opts.refLabel).toBeTruthy();
  });

  it("renders a promotedThreads entry as a link to /thread/:id", () => {
    renderDoc();
    const link = screen.getByRole("link", { name: /Was this radar contact ever explained/ });
    expect(link).toHaveAttribute("href", "/thread/th1");
  });

  it("shows a simple not-found state when the record is missing (never indexes into undefined)", () => {
    useRecordMock.mockReturnValue({ data: undefined, isLoading: false });
    renderDoc();
    expect(screen.getByText(/file not found/i)).toBeInTheDocument();
  });
});
