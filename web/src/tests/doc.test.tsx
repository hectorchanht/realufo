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
import { act, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { CommentsResponse, RecordDetail, RecordsListResponse } from "../api/types";
import Doc from "../screens/Doc";

const mockOpenComposer = vi.fn();
const mockOpenViewer = vi.fn();

vi.mock("../overlays/OverlayProvider", () => ({
  useOverlay: () => ({ openComposer: mockOpenComposer, openViewer: mockOpenViewer, toast: vi.fn() }),
}));

// Spy on react-router's useNavigate (everything else — MemoryRouter, Routes,
// Route, Link, useParams, useSearchParams — stays real) so the swipe/
// prev-next tests below can assert *where* clicking an arrow navigates,
// without needing to synthesize a pointer-swipe gesture in jsdom (clicking
// the prev/next arrow buttons exercises the exact same `goTo()` path).
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

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
  series: { prev: "rec0", next: null },
  release: { no: 4, date: "2026-07-10" },
  related: [
    {
      key: "agency",
      label: "FBI",
      records: [
        {
          id: "rec7", archive: "wargov", agency: "FBI", title: "FBI-UAP-007, Roswell teletype", summary: "",
          kind: "pdf", redacted: 0, thumb: null, location: null, incident_date: null, doc_date: null,
        },
      ],
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

// Fixture for the swipe/prev-next tests: an ordered 3-record list ("a",
// "mid", "c") standing in for the archive-filter list `useRecords` would
// return, with the record-under-test in the middle.
const orderedRecords: RecordsListResponse = {
  count: 3,
  records: [
    {
      id: "a",
      archive: "wargov",
      agency: "CIA",
      title: "a_first_record",
      summary: "",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      location: null,
      incident_date: null,
      doc_date: null,
    },
    {
      id: "mid",
      archive: "wargov",
      agency: "CIA",
      title: "mid_middle_record",
      summary: "",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      location: null,
      incident_date: null,
      doc_date: null,
    },
    {
      id: "c",
      archive: "wargov",
      agency: "CIA",
      title: "c_last_record",
      summary: "",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      location: null,
      incident_date: null,
      doc_date: null,
    },
  ],
};

const midDetail: RecordDetail = {
  ...mockDetail,
  record: { ...mockDetail.record, id: "mid" },
  promotedThreads: [],
};

const lastDetail: RecordDetail = {
  ...mockDetail,
  record: { ...mockDetail.record, id: "c" },
  promotedThreads: [],
};

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
  it("links the agency chip and meta values to their hubs when present", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, hubs: { agency: "cia", location: "roswell", release: "4", decade: "1970s" } },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByRole("link", { name: "Central Intelligence Agency" })).toHaveAttribute("href", "/agency/cia");
    expect(screen.getByRole("link", { name: "Roswell, NM" })).toHaveAttribute("href", "/location/roswell");
    expect(screen.getByRole("link", { name: "1978-04-01" })).toHaveAttribute("href", "/release/4");
    expect(screen.getByRole("link", { name: "1978-03-04" })).toHaveAttribute("href", "/decade/1970s");
  });

  it("keeps agency and meta values as plain text without hubs", () => {
    renderDoc();
    expect(screen.queryByRole("link", { name: "Central Intelligence Agency" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Roswell, NM" })).toBeNull();
  });
  it("shows FULL TEXT pages in a scroll box, continuation when truncated", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        fullText: {
          pages: [{ n: 1, text: "First page words <script>x</script>" }, { n: 4, text: "Fourth page words" }],
          truncated: true,
          total_pages: 9,
        },
      },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByText("FULL TEXT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "AI SUMMARY" })).toBeNull();
    expect(screen.getByText("2 of 9 pages · OCR, may contain errors")).toBeInTheDocument();
    const box = screen.getByLabelText("Full text pages");
    expect(box.className).toContain("overflow-y-auto");
    expect(box.textContent).toContain("First page words <script>x</script>");
    expect(box.textContent).toContain("Fourth page words");
    fireEvent.click(screen.getByRole("button", { name: "Text continues in the original file →" }));
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("with an AI summary: shows the summary first, FULL TEXT toggle swaps to the pages", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        fullText: { pages: [{ n: 1, text: "Page one words" }], truncated: false, total_pages: 1, aiSummary: "An AI paragraph." },
      },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByText("An AI paragraph.")).toBeInTheDocument();
    expect(screen.getByText("AI-generated from OCR text · may contain errors")).toBeInTheDocument();
    expect(screen.queryByLabelText("Full text pages")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "FULL TEXT" }));
    expect(screen.queryByText("An AI paragraph.")).toBeNull();
    expect(screen.getByLabelText("Full text pages").textContent).toContain("Page one words");
    fireEvent.click(screen.getByRole("button", { name: "AI SUMMARY" }));
    expect(screen.getByText("An AI paragraph.")).toBeInTheDocument();
  });

  it("hides FULL TEXT when there is none or no page passed the filter", () => {
    renderDoc();
    expect(screen.queryByText("FULL TEXT")).toBeNull();
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, fullText: { pages: [], truncated: false, total_pages: 3 } },
      isLoading: false,
    });
    renderDoc();
    expect(screen.queryByText("FULL TEXT")).toBeNull();
  });
  it("fades the media-panel chrome after idle, brings it back on pointer move", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderDoc();
      const panel = container.querySelector("[data-chrome]")!;
      expect(panel.getAttribute("data-chrome")).toBe("on");
      act(() => vi.advanceTimersByTime(3000));
      expect(panel.getAttribute("data-chrome")).toBe("off");
      fireEvent.pointerMove(panel);
      expect(panel.getAttribute("data-chrome")).toBe("on");
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the meta grid fields and the summary", () => {
    renderDoc();
    expect(screen.getByText("1978-03-04")).toBeInTheDocument();
    expect(screen.getByText("Roswell, NM")).toBeInTheDocument();
    expect(screen.getByText("1978-04-01")).toBeInTheDocument();
    expect(screen.getByText("DOD-1978-00417")).toBeInTheDocument();
    expect(screen.getByText(/unusual radar contact over restricted airspace/)).toBeInTheDocument();
  });

  it("shows the record id kicker and the full official title (id prefix kept)", () => {
    renderDoc();
    expect(screen.getByText("rec1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("CIA-UAP-017, Placement on High Alert near Roswell");
  });

  it("shows the release badge and series prev link (no next at series end)", () => {
    renderDoc();
    expect(screen.getByText("RELEASE 04")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /previous in series.*rec0/i })).toHaveAttribute("href", "/doc/rec0");
    expect(screen.queryByRole("link", { name: /next in series/i })).toBeNull();
  });

  it("shows related groups as file cards and sets the uapbrowser-style tab title", () => {
    renderDoc();
    expect(screen.getByText(/same agency/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /FBI-UAP-007, Roswell teletype/ })).toHaveAttribute("href", "/doc/rec7");
    expect(document.title).toBe("Placement on High Alert near Roswell — UAP file rec1 · RealUFO");
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

  it("falls back to the hatch placeholder when the media thumbnail fails to load", () => {
    renderDoc();
    const img = document.querySelector('[data-screen="doc"] img');
    expect(img).toBeTruthy();
    fireEvent.error(img!);
    // img is swapped out for the diagonal-hatch placeholder (no broken-image icon)
    expect(document.querySelector('[data-screen="doc"] img')).toBeNull();
  });

  it("opening a PDF hands off to a new browser tab, not the in-app iframe viewer", () => {
    // Cross-origin PDF-in-<iframe> renders blank on many browsers, so PDFs open
    // via window.open (native PDF handling) instead of openViewer.
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /OPEN ORIGINAL/i }));
    // same-origin inline route (mobile views instead of downloading)
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1", "_blank", "noopener,noreferrer");
    expect(mockOpenViewer).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("renders an IMAGE record's full file inline even with no thumb asset", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    expect(document.querySelector('[data-screen="doc"] img')).toHaveAttribute("src", "https://cdn.example/photo.jpg");
  });

  it("image tools: presets + sliders filter the image, reset clears, lens overlays the panel", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const img = () => document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
    expect(screen.getByRole("button", { name: /adjust/i })).toHaveAttribute("aria-expanded", "true"); // open by default
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toContain("invert(1)");
    // presets are toggles: lit while active, a second click turns it off
    expect(screen.getByRole("button", { name: /invert ir/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    fireEvent.change(screen.getByLabelText(/brightness/i), { target: { value: "150" } });
    expect(img().style.filter).toContain("brightness(1.5)");
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(img().style.filter).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /lens/i }));
    expect(document.querySelector("[data-zoom-lens]")).toBeInTheDocument();
    // lens mode replaces tap-to-open
    expect(screen.queryByRole("button", { name: /open IMG/i })).toBeNull();
  });

  it("video tools: speed, frame step, loop, A–B, filters and lens drive the <video>", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    renderDoc();
    const video = document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    video.currentTime = 2;

    fireEvent.click(screen.getByRole("button", { name: "0.25×" }));
    expect(video.playbackRate).toBe(0.25);
    expect(screen.getByRole("button", { name: "0.25×" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: /next frame/i }));
    expect(video.currentTime).toBeCloseTo(2 + 1 / 30);
    fireEvent.click(screen.getByRole("button", { name: /previous frame/i }));
    expect(video.currentTime).toBeCloseTo(2);
    expect(pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^loop$/i }));
    expect(video.loop).toBe(true);

    // A–B: first click marks A, second marks B, third clears
    const ab = () => screen.getByRole("button", { name: /loop a–b/i });
    fireEvent.click(ab());
    expect(ab()).toHaveAccessibleName(/set B/i);
    video.currentTime = 3;
    fireEvent.click(ab());
    expect(ab()).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(ab());
    expect(ab()).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByRole("button", { name: /adjust/i })).toHaveAttribute("aria-expanded", "true"); // open by default
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(video.style.filter).toContain("invert(1)");
    fireEvent.click(screen.getByRole("button", { name: /lens/i }));
    expect(document.querySelector("[data-zoom-lens]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /capture frame/i })).toBeInTheDocument();
    pause.mockRestore();
  });

  it("with a mouse the lens is on by default and click-through (tap-to-open still works)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const layer = document.querySelector("[data-zoom-lens]") as HTMLElement;
    expect(layer).toBeInTheDocument();
    expect(layer.style.pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: /open IMG/i })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("lens bubble is portalled out of the panel so its overflow-hidden doesn't clip it", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const img = document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
    Object.defineProperty(img, "naturalWidth", { value: 400 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });
    fireEvent.click(screen.getByRole("button", { name: /lens/i }));
    const layer = document.querySelector("[data-zoom-lens]") as HTMLElement;
    layer.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON() {} });
    // pointer near the panel's top-right corner
    fireEvent.pointerDown(layer, { clientX: 490, clientY: 60, pointerType: "mouse" });
    const bubble = document.body.querySelector(":scope > .rounded-full.fixed") as HTMLElement;
    expect(bubble).toBeInTheDocument();
    expect(layer.contains(bubble)).toBe(false);
    expect(bubble.style.left).toBe(`${490 - 85}px`);
    expect(bubble.style.top).toBe(`${60 - 85}px`);
    // touch: docks below the panel (clear of the finger), x follows the finger clamped on-screen
    vi.stubGlobal("innerWidth", 520);
    vi.stubGlobal("innerHeight", 800);
    fireEvent.pointerMove(layer, { clientX: 490, clientY: 200, pointerType: "touch" });
    expect(bubble.style.top).toBe(`${350 + 8}px`);
    expect(bubble.style.left).toBe(`${520 - 170 - 8}px`);
    // no room below → docks above
    layer.getBoundingClientRect = () => ({ left: 100, top: 250, width: 400, height: 300, right: 500, bottom: 550, x: 100, y: 250, toJSON() {} });
    vi.stubGlobal("innerHeight", 600);
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 400, pointerType: "touch" });
    expect(bubble.style.top).toBe(`${250 - 8 - 170}px`);
    vi.unstubAllGlobals();
  });

  it("palette, sharpen, rotate, flip and keyboard shortcuts drive the media panel", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const img = () => document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
    fireEvent.click(screen.getByRole("button", { name: "Ironbow" }));
    expect(img().style.filter).toContain("#ru-ironbow");
    expect(document.getElementById("ru-ironbow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sharpen" }));
    expect(img().style.filter).toContain("#ru-sharpen");
    // presets keep the palette
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toContain("invert(1)");
    expect(img().style.filter).toContain("#ru-ironbow");

    fireEvent.click(screen.getByRole("button", { name: /rotate 90/i }));
    expect(img().style.transform).toContain("rotate(90deg)");
    fireEvent.click(screen.getByRole("button", { name: "Flip" }));
    expect(img().style.transform).toContain("scaleX(-1)");

    fireEvent.keyDown(window, { key: "r" });
    expect(img().style.transform).toContain("rotate(180deg)");
    fireEvent.keyDown(window, { key: "i" });
    expect(img().style.filter).not.toContain("invert(1)");
    fireEvent.keyDown(window, { key: "l" });
    expect(document.querySelector("[data-zoom-lens]")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "=" });
    expect(screen.getByRole("button", { name: /lens magnification 5×/i })).toBeInTheDocument();
  });

  it("video: ?t= link sharing, post frame opens the composer, comment timestamps seek", async () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    useCommentsMock.mockReturnValue({
      data: { comments: [{ ...mockComments.comments[0], body: "Look at @0:05.50 — the blob turns." }] },
      isLoading: false,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDoc();
    const video = document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    video.currentTime = 12.5;
    fireEvent.click(screen.getByRole("button", { name: /copy link to this moment/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/doc\/rec1\?t=12\.50$/));

    fireEvent.click(screen.getByRole("button", { name: "@0:05.50" }));
    expect(video.currentTime).toBeCloseTo(5.5);
    // the seek bar mirrors the video
    expect(screen.getByRole("slider", { name: "Seek" })).toBeInTheDocument();
  });

  it("video key moments: parsed from the official description, click seeks, summary keeps only prose", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: {
          ...mockDetail.record,
          kind: "video",
          summary: "CENTCOM submitted a report.\n\nVideo Description:\n00:00-00:04: The sensor pans.\n00:51-01:21: The sensor zooms out.",
        },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const list = screen.getByRole("region", { name: "Key moments" });
    expect(list).toHaveTextContent("The sensor zooms out.");
    const video = document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    fireEvent.click(screen.getByRole("button", { name: /00:51/ }));
    expect(video.currentTime).toBe(51);
    fireEvent(video, new Event("seeked"));
    expect(screen.getByRole("button", { name: /00:51/ })).toHaveAttribute("aria-current", "true");
    // summary paragraph no longer repeats the time-coded lines
    expect(screen.getByText("CENTCOM submitted a report.")).toBeInTheDocument();
    expect(screen.getAllByText(/The sensor pans\./)).toHaveLength(1);
  });

  it("no key moments section for videos without a time-coded description", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Archival 16mm footage." },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    expect(screen.queryByRole("region", { name: "Key moments" })).toBeNull();
  });

  const AI = JSON.stringify({ model: "m", generated_at: "t", moments: [{ start: 0, end: 30, text: "A light source drifts right." }, { start: 30, end: 60, text: "The sensor zooms out." }] });

  it("AI key moments: Official default, toggle to AI shows AI rows + amber label, choice remembered", () => {
    localStorage.removeItem?.("ru:moments-src");
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Report.\n\nVideo Description:\n00:00-00:04: The sensor pans.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    const { unmount } = renderDoc();
    const box = screen.getByRole("region", { name: "Key moments" });
    expect(box).toHaveTextContent("The sensor pans.");
    expect(box).toHaveTextContent("from the official video description");
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(box).toHaveTextContent("A light source drifts right.");
    expect(box).toHaveTextContent("AI-generated from video frames · may be inaccurate");
    expect(screen.getByRole("button", { name: "AI" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    renderDoc();
    expect(screen.getByRole("region", { name: "Key moments" })).toHaveTextContent("A light source drifts right.");
    localStorage.removeItem?.("ru:moments-src");
  });

  it("AI-only video shows the AI list without a toggle", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Archival footage.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const box = screen.getByRole("region", { name: "Key moments" });
    expect(box).toHaveTextContent("The sensor zooms out.");
    expect(box).toHaveTextContent("AI-generated from video frames · may be inaccurate");
    expect(screen.queryByRole("button", { name: "Official" })).toBeNull();
  });

  it("toggle still works when localStorage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "R.\n\nVideo Description:\n00:00-00:04: The sensor pans.", ai_moments: AI },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: "AI" }));
    expect(screen.getByRole("region", { name: "Key moments" })).toHaveTextContent("A light source drifts right.");
    get.mockRestore();
    set.mockRestore();
  });

  it("no image tools on non-image records", () => {
    renderDoc();
    expect(screen.queryByRole("button", { name: /adjust/i })).toBeNull();
  });

  it("opening a VIDEO record uses the in-app media viewer (not a new tab)", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /OPEN ORIGINAL/i }));
    expect(mockOpenViewer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "video", url: "https://cdn.example/clip.mp4" }),
    );
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  describe("swipe / prev-next navigation", () => {
    beforeEach(() => {
      mockNavigate.mockReset();
      useRecordsMock.mockReturnValue({ data: orderedRecords, isLoading: false });
    });

    it('shows the "N / M" index pill and renders both prev/next arrows for a record in the middle of the list', () => {
      useRecordMock.mockReturnValue({ data: midDetail, isLoading: false });
      renderDoc("/doc/mid");

      expect(screen.getByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /previous file/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /next file/i })).toBeInTheDocument();
    });

    it("clicking the next arrow navigates toward the next id in the list", () => {
      useRecordMock.mockReturnValue({ data: midDetail, isLoading: false });
      renderDoc("/doc/mid");

      fireEvent.click(screen.getByRole("button", { name: /next file/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/doc/c");
    });

    it("clicking the prev arrow navigates toward the previous id in the list", () => {
      useRecordMock.mockReturnValue({ data: midDetail, isLoading: false });
      renderDoc("/doc/mid");

      fireEvent.click(screen.getByRole("button", { name: /previous file/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/doc/a");
    });

    it("hides the next arrow at the end of the list — wrap-around never navigates past the end", () => {
      useRecordMock.mockReturnValue({ data: lastDetail, isLoading: false });
      renderDoc("/doc/c");

      expect(screen.getByText("3 / 3")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /next file/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /previous file/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /previous file/i }));
      expect(mockNavigate).toHaveBeenCalledWith("/doc/mid");
      expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringContaining("/doc/d"));
    });

    it("reads the forwarded archive page and crosses into neighbour pages at its edges", () => {
      const one = (id: string) => ({ ...orderedRecords.records[0], id });
      useRecordsMock.mockImplementation((params: { offset?: number; archive?: string }) => {
        const records =
          params.offset === 40 ? orderedRecords.records : params.offset === 0 ? [one("p1a"), one("p1z")] : [one("p3a")];
        return { data: { count: 83, records }, isLoading: false };
      });

      // middle of page 2: global index, same-page neighbours keep page=2
      useRecordMock.mockReturnValue({ data: midDetail, isLoading: false });
      const { unmount } = renderDoc("/doc/mid?archive=nara&page=2");
      expect(useRecordsMock).toHaveBeenCalledWith(expect.objectContaining({ archive: "nara", limit: 40, offset: 40 }));
      expect(screen.getByText("42 / 83")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /next file/i }));
      expect(mockNavigate).toHaveBeenLastCalledWith("/doc/c?archive=nara&page=2");
      unmount();

      // last item of page 2 -> first item of page 3
      useRecordMock.mockReturnValue({ data: lastDetail, isLoading: false });
      const r2 = renderDoc("/doc/c?archive=nara&page=2");
      fireEvent.click(screen.getByRole("button", { name: /next file/i }));
      expect(mockNavigate).toHaveBeenLastCalledWith("/doc/p3a?archive=nara&page=3");
      r2.unmount();

      // first item of page 2 -> last item of page 1 (page param dropped)
      useRecordMock.mockReturnValue({ data: { ...midDetail, record: { ...midDetail.record, id: "a" } }, isLoading: false });
      renderDoc("/doc/a?archive=nara&page=2");
      fireEvent.click(screen.getByRole("button", { name: /previous file/i }));
      expect(mockNavigate).toHaveBeenLastCalledWith("/doc/p1z?archive=nara");
    });
  });
});
