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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { CommentsResponse, RecordDetail, RecordsListResponse } from "../api/types";
import Doc from "../screens/Doc";
import SiteFooter from "../components/SiteFooter";
import { FooterLinksProvider } from "../lib/footerLinks";
import { ThemeProvider } from "../theme/ThemeProvider";

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
const mockQuickMutate = vi.fn();
const useAddCommentMock = vi.fn();

vi.mock("../api/queries", () => ({
  isVotedLocally: () => false,
  useRecord: (id: string) => useRecordMock(id),
  useComments: (id: string) => useCommentsMock(id),
  useRecords: (params: Record<string, unknown>) => useRecordsMock(params),
  useBootstrap: () => useBootstrapMock(),
  useVote: () => ({ mutate: vi.fn(), isPending: false }),
  useCastVerdict: () => ({ mutate: vi.fn(), isPending: false }),
  useAddComment: (id: string) => useAddCommentMock(id),
  useDiscussionStarter: () => ({ data: undefined, isLoading: false }),
  useHubs: () => ({ data: { hubs: [] } }),
}));

const mockDetail: RecordDetail = {
  record: {
    id: "rec1",
    archive: "wargov",
    agency: "CIA",
    agency_full: "Central Intelligence Agency",
    title: "rec1, Placement on High Alert near Roswell",
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
  localStorage.removeItem?.("ru:console-open");
  localStorage.removeItem?.("ru:media-skin");
  localStorage.removeItem?.("ru:media-presets");
  useRecordMock.mockReset();
  useCommentsMock.mockReset();
  useRecordsMock.mockReset();
  useBootstrapMock.mockReset();
  mockQuickMutate.mockReset();
  useAddCommentMock.mockReset();
  useAddCommentMock.mockReturnValue({ mutate: mockQuickMutate, isPending: false });
  useRecordMock.mockReturnValue({ data: mockDetail, isLoading: false });
  useCommentsMock.mockReturnValue({ data: mockComments, isLoading: false });
  useRecordsMock.mockReturnValue({ data: emptyRecords, isLoading: false });
  useBootstrapMock.mockReturnValue({ data: undefined, isLoading: false });
});

describe("Doc", () => {
  it("shows the file's topics as links", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, topics: [{ slug: "aawsap", label: "AAWSAP & DIRDs" }] },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByRole("link", { name: "AAWSAP & DIRDs" }).getAttribute("href")).toBe("/topic/aawsap");
  });

  it("links every chip to its hub (same .tag look) and lists the hubs in the footer; meta values stay text", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, hubs: { agency: "cia", location: "roswell", release: "4", decade: "1970s" } },
      isLoading: false,
    });
    render(
      <MemoryRouter initialEntries={["/doc/rec1"]}>
        <FooterLinksProvider>
          <Routes>
            <Route path="/doc/:id" element={<Doc />} />
          </Routes>
          <ThemeProvider>
            <SiteFooter />
          </ThemeProvider>
        </FooterLinksProvider>
      </MemoryRouter>,
    );
    const agency = screen.getByRole("link", { name: "Central Intelligence Agency" });
    expect(agency).toHaveAttribute("href", "/agency/cia");
    const release = screen.getByRole("link", { name: "RELEASE 04" });
    expect(release).toHaveAttribute("href", "/release/4");
    for (const chip of [agency, release]) expect(chip.className).toBe("tag");
    expect(screen.queryByRole("link", { name: "Roswell, NM" })).toBeNull();
    expect(screen.getByRole("heading", { name: "This file" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "More from Central Intelligence Agency" })).toHaveAttribute("href", "/agency/cia");
    expect(screen.getByRole("link", { name: "More from Roswell, NM" })).toHaveAttribute("href", "/location/roswell");
    expect(screen.getByRole("link", { name: /^More from Release 0?4$/ })).toHaveAttribute("href", "/release/4");
    expect(screen.getByRole("link", { name: "More from the 1970s" })).toHaveAttribute("href", "/decade/1970s");
  });

  it("without hubs, chips link to the filtered archive; meta values stay plain text", () => {
    renderDoc();
    expect(screen.getByRole("link", { name: "Central Intelligence Agency" })).toHaveAttribute("href", "/archive?agency=CIA");
    expect(screen.getByRole("link", { name: "RELEASE 04" })).toHaveAttribute("href", "/archive?archive=wargov&release=4");
    expect(screen.queryByRole("link", { name: "Roswell, NM" })).toBeNull();
  });
  it("shows FULL TEXT one page at a time in a scroll box, continuation when truncated", () => {
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
    const box = screen.getByLabelText("Full text page");
    expect(box.className).toContain("overflow-y-auto");
    expect(box.textContent).toContain("First page words <script>x</script>");
    expect(box.textContent).not.toContain("Fourth page words");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByLabelText("Full text page").textContent).toContain("Fourth page words");
    fireEvent.click(screen.getByRole("button", { name: "Text continues in the original file →" }));
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1#page=4", "_blank", "noopener,noreferrer"); // page turn set ?p=4
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
    expect(screen.queryByLabelText("Full text page")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "FULL TEXT" }));
    expect(screen.queryByText("An AI paragraph.")).toBeNull();
    expect(screen.getByLabelText("Full text page").textContent).toContain("Page one words");
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

  it("puts the TL;DR card and the WTF-meter under the title, above the meta grid", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, tldr: { bullets: ["a", "b", "c"], oneLiner: "Paperwork wins.", cardUrl: null } },
      isLoading: false,
    });
    renderDoc();
    const html = document.body.innerHTML;
    const h1 = html.indexOf("<h1"), card = html.indexOf('aria-label="TL;DR"'), meter = html.indexOf('aria-label="WTF-meter"'), meta = html.indexOf("Incident");
    expect(h1).toBeLessThan(card);
    expect(card).toBeLessThan(meter);
    expect(meter).toBeLessThan(meta);
  });

  it("no TL;DR: no card", () => {
    renderDoc();
    expect(screen.queryByText(/TL;DR/)).toBeNull();
  });

  it("renders the meta grid fields and the summary", () => {
    renderDoc();
    expect(screen.getByText("1978-03-04")).toBeInTheDocument();
    expect(screen.getByText("Roswell, NM")).toBeInTheDocument();
    expect(screen.getByText("1978-04-01")).toBeInTheDocument();
    expect(screen.getByText("DOD-1978-00417")).toBeInTheDocument();
    expect(screen.getByText(/unusual radar contact over restricted airspace/)).toBeInTheDocument();
  });

  it("leaves empty meta fields out instead of showing a bare label", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, record: { ...mockDetail.record, incident_date: null, location: "N/A", virin: null } },
      isLoading: false,
    });
    renderDoc();
    expect(screen.queryByText("Incident")).toBeNull();
    expect(screen.queryByText("Location")).toBeNull();
    expect(screen.queryByText("VIRIN")).toBeNull();
    expect(screen.getByText("Released")).toBeInTheDocument();
  });

  it("shows the id once as a kicker inside the h1; the title drops the id prefix (no stray // text)", () => {
    renderDoc();
    expect(screen.getByText("rec1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("rec1, Placement on High Alert near Roswell");
    expect(document.body.textContent).not.toContain("//");
  });

  it("hides the kicker when the id only respells the title", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, record: { ...mockDetail.record, id: "AARO-IMG-Go_Fast_UAP", title: "Go Fast UAP" } },
      isLoading: false,
    });
    renderDoc("/doc/AARO-IMG-Go_Fast_UAP");
    expect(screen.queryByText("AARO-IMG-Go_Fast_UAP")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Go Fast UAP");
    expect(document.title).toBe("Go Fast UAP · RealUFO");
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
    expect(screen.getByRole("link", { name: /FBI-UAP-007.*Roswell teletype/ })).toHaveAttribute("href", "/doc/rec7");
    expect(document.title).toBe("rec1 — Placement on High Alert near Roswell · RealUFO");
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
    expect(opts.boardId).toBe("gov"); // a PDF is a government document
    expect(opts.presetBody).toBeUndefined();
    expect(opts.refLabel).toBeTruthy();
  });

  it("file threads from a video or image land on the footage board", () => {
    useRecordMock.mockReturnValue({ data: { ...mockDetail, record: { ...mockDetail.record, kind: "video" } }, isLoading: false });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /Start a board thread about this file/i }));
    fireEvent.click(screen.getByRole("button", { name: /to a board/i }));
    expect(mockOpenComposer.mock.calls.map(([o]) => o.boardId)).toEqual(["vids", "vids"]);
  });

  it("renders a promotedThreads entry as a link to /thread/:id", () => {
    renderDoc();
    const link = screen.getByRole("link", { name: /Was this radar contact ever explained/ });
    expect(link).toHaveAttribute("href", "/thread/th1");
  });

  it('"Discuss this" in the discussion header deep-links to the record\'s board thread', () => {
    renderDoc();
    const cta = screen.getByRole("link", { name: /Discuss this/ });
    expect(cta).toHaveAttribute("href", "/thread/th1");
  });

  it('"Start the discussion" opens the newThread composer when no thread exists yet', () => {
    useRecordMock.mockReturnValue({ data: { ...mockDetail, promotedThreads: [] }, isLoading: false });
    renderDoc();
    expect(screen.queryByRole("link", { name: /Discuss this/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Start the discussion/i }));
    expect(mockOpenComposer).toHaveBeenCalledTimes(1);
    const [opts] = mockOpenComposer.mock.calls[0];
    expect(opts.mode).toBe("newThread");
    expect(opts.sourceRecordId).toBe("rec1");
    expect(opts.boardId).toBe("gov"); // a PDF is a government document
  });

  it("sticky quick-reply bar posts a comment via useAddComment and clears on success", () => {
    mockQuickMutate.mockImplementation((_vars, opts) => opts.onSuccess());
    renderDoc();
    const bar = document.querySelector('[data-quickreply]');
    expect(bar).toBeTruthy();
    expect(bar!.className).toContain("sticky");
    const input = screen.getByRole("textbox", { name: /Add your read on this file/i });
    const send = screen.getByRole("button", { name: /Send reply/i });
    expect(send).toBeDisabled(); // empty draft can't send
    fireEvent.change(input, { target: { value: "  hello from the bar  " } });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    expect(useAddCommentMock).toHaveBeenCalledWith("rec1");
    expect(mockQuickMutate).toHaveBeenCalledWith({ body: "hello from the bar" }, expect.any(Object));
    expect(input).toHaveValue("");
  });

  it("quick-reply send stays disabled for whitespace-only drafts", () => {
    renderDoc();
    const input = screen.getByRole("textbox", { name: /Add your read on this file/i });
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Send reply/i })).toBeDisabled();
    expect(mockQuickMutate).not.toHaveBeenCalled();
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
    const adjust = screen.getByRole("button", { name: /adjust/i });
    expect(adjust).toHaveAttribute("aria-expanded", "false"); // closed by default
    fireEvent.click(adjust);
    expect(localStorage.getItem("ru:console-open")).toBe("1"); // remembered for later pages
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toContain("invert(1)");
    // presets are toggles: lit while active, a second click turns it off
    expect(screen.getByRole("button", { name: /invert ir/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    fireEvent.change(screen.getByLabelText(/brightness/i), { target: { value: "150" } });
    expect(img().style.filter).toContain("brightness(1.5)");
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
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
    expect(video.autoplay).toBe(true);
    expect(video.muted).toBe(true); // muted, or browsers block autoplay
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    video.currentTime = 2;

    // speed + loop live in the Adjust panel, closed by default
    expect(screen.queryByRole("button", { name: "Speed 0.25×" })).toBeNull();
    const adjust = screen.getByRole("button", { name: /adjust/i });
    expect(adjust).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(adjust);
    expect(localStorage.getItem("ru:console-open")).toBe("1"); // remembered for later pages

    fireEvent.click(screen.getByRole("button", { name: "Speed 0.25×" }));
    expect(video.playbackRate).toBe(0.25);
    expect(screen.getByRole("button", { name: "Speed 0.25×" })).toHaveAttribute("aria-pressed", "true");

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

    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    // filter sits on a wrapper: on the <video> itself macOS Chrome's overlay path drops url() filters
    expect(video.style.filter).toBe("");
    expect(video.parentElement!.style.filter).toContain("invert(1)");
    fireEvent.click(screen.getByRole("button", { name: /lens/i }));
    expect(document.querySelector("[data-zoom-lens]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /capture frame/i })).toBeInTheDocument();
    pause.mockRestore();
  });

  it("video: the Adjust button sits right after Download, and the tool buttons hide inside its panel", () => {
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
    // tools are hidden until Adjust opens
    expect(screen.queryByRole("button", { name: "Lens" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Zoom in" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ruler" })).toBeNull();
    // one Adjust button, immediately after Download in the transport row
    const adjust = screen.getByRole("button", { name: /adjust/i });
    const download = screen.getByRole("button", { name: /download video/i });
    expect(adjust.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(adjust.previousElementSibling).toBe(download);
    fireEvent.click(adjust);
    expect(screen.getByRole("button", { name: "Lens" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    pause.mockRestore();
  });

  it("with a mouse the lens is on by default and click-through (tap-to-open still works)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine") || q.includes("900px"),
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

    // help: hidden until hover/click; click pins it, Esc closes. With a mouse each row shows its keys.
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    const keysBtn = screen.getByRole("button", { name: "How to use the media tools" });
    const tip = document.getElementById(keysBtn.getAttribute("aria-controls")!)!;
    const row = (name: string) => [...tip.querySelectorAll("li")].find((li) => li.querySelector("b")?.textContent === name);
    expect(row("Turn")?.querySelector("kbd")).toHaveTextContent("R");
    expect(row("Zoom in or out")).toHaveTextContent("Ctrl/⌘ + scroll");
    expect(tip.className).toContain("hidden");
    fireEvent.click(keysBtn);
    expect(keysBtn).toHaveAttribute("aria-expanded", "true");
    expect(tip.className).not.toContain(" hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(keysBtn).toHaveAttribute("aria-expanded", "false");
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
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: /lens/i }));
    const layer = document.querySelector("[data-zoom-lens]") as HTMLElement;
    layer.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400, height: 300, right: 500, bottom: 350, x: 100, y: 50, toJSON() {} });
    // pointer near the panel's top-right corner
    fireEvent.pointerDown(layer, { clientX: 490, clientY: 60, pointerType: "mouse" });
    const bubble = document.body.querySelector(":scope > .rounded-full.fixed") as HTMLElement;
    expect(bubble).toBeInTheDocument();
    expect(layer.contains(bubble)).toBe(false);
    // stacks above the full-screen MediaViewer (z-[70]), else the expanded image hides it
    expect(bubble).toHaveClass("z-[75]");
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
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    fireEvent.click(screen.getByRole("button", { name: "Ironbow" }));
    expect(img().style.filter).toContain("#ru-ironbow");
    expect(document.getElementById("ru-ironbow")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sharpen" }));
    expect(img().style.filter).toContain("#ru-sharpen");
    // presets keep the palette
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    expect(img().style.filter).toContain("invert(1)");
    expect(img().style.filter).toContain("#ru-ironbow");

    // panel takes the picture's shape, turned with it at 90° so the rotated picture fills it
    Object.defineProperty(img(), "naturalWidth", { configurable: true, value: 1600 });
    Object.defineProperty(img(), "naturalHeight", { configurable: true, value: 1000 });
    fireEvent.load(img());
    const panel = img().closest("[data-chrome]") as HTMLElement;
    expect(panel.style.aspectRatio).toMatch(/^1\.6/);
    fireEvent.click(screen.getByRole("button", { name: /rotate 90/i }));
    expect(img().style.transform).toContain("rotate(90deg)");
    expect(panel.style.aspectRatio).toMatch(/^0\.625/);
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

    // frame zoom chips: + / − step 1.5× around the centre, clamped 1–8×
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(panel.className).not.toContain("cursor-grab");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(img().style.transform).toContain("scale(1.5)");
    // zoomed: a grab cursor says it pans, and the <img> can't be dragged away natively (that cancels the pan)
    expect(panel.className).toContain("cursor-grab");
    expect(img().draggable).toBe(false);
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("1.5×");
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    expect(img().style.transform).toContain("scale(8)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByRole("button", { name: "Zoom in" })).not.toBeDisabled();
  });

  it("video opened from a ?t= link waits at its moment: no autoplay, not muted", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc("/doc/rec1?t=12.5");
    const video = document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    expect(video.autoplay).toBe(false);
    expect(video.muted).toBe(false);
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

  it("shared view: ?z/cx/cy/rot applies on load; the link chip copies filters + view", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderDoc("/doc/rec1?br=120&z=2&cx=0.25&cy=0.5&rot=90");
    const img = document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
    const panel = img.closest("[data-chrome]") as HTMLElement;
    panel.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);
    expect(img.style.transform).toContain("rotate(90deg)");
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent("2.0×");
    fireEvent.click(screen.getByRole("button", { name: "Copy link to this view" }));
    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.pathname).toBe("/doc/rec1");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ br: "120", z: "2", cx: "0.25", cy: "0.5", rot: "90" });
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

  it("moments in the same second get tenths so their labels differ", () => {
    const close = JSON.stringify({ model: "m", generated_at: "t", moments: [
      { start: 0, end: 8.2, text: "Canopy view." }, { start: 8.2, end: 8.9, text: "Camera swings up." },
      { start: 8.96, end: 9.03, text: "Object streaks across." }] });
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video", summary: "Clip.", ai_moments: close },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const box = screen.getByRole("region", { name: "Key moments" });
    expect(box).toHaveTextContent("00:00.0");
    expect(box).toHaveTextContent("00:08.2");
    expect(box).toHaveTextContent("00:08.9");
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

  it("double-tap zooms 2.5× at that spot (and doesn't open the image); again resets; one tap opens after a beat", () => {
    vi.useFakeTimers();
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
    const panel = img.closest("[data-chrome]") as HTMLElement;
    panel.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);
    const tap = (el: Element, x = 300, y = 100) => {
      const at = { clientX: x, clientY: y, pointerId: 1, pointerType: "touch" };
      fireEvent.pointerDown(el, at);
      fireEvent.pointerUp(el, at);
      fireEvent.click(el, at);
    };
    tap(screen.getByRole("button", { name: /open IMG/i }));
    act(() => vi.advanceTimersByTime(120));
    tap(screen.getByRole("button", { name: /open IMG/i }));
    expect(img.style.transform).toContain("scale(2.5)");
    act(() => vi.advanceTimersByTime(1000));
    expect(mockOpenViewer).not.toHaveBeenCalled();

    tap(panel);
    act(() => vi.advanceTimersByTime(120));
    tap(panel);
    expect(img.style.transform).toBe("");

    act(() => vi.advanceTimersByTime(1000));
    tap(screen.getByRole("button", { name: /open IMG/i }));
    expect(mockOpenViewer).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(mockOpenViewer).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("hold to compare: the Original chip (or \\ key) shows the unfiltered picture while held", () => {
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
    expect(screen.queryByRole("button", { name: /hold to see the original/i })).toBeNull(); // nothing to compare yet
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
    const chipBtn = screen.getByRole("button", { name: /hold to see the original/i });
    fireEvent.pointerDown(chipBtn, { pointerId: 1 });
    expect(img().style.filter).toBe("");
    expect(chipBtn).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerUp(chipBtn, { pointerId: 1 });
    expect(img().style.filter).toContain("invert(1)");
    fireEvent.keyDown(window, { key: "\\" });
    expect(img().style.filter).toBe("");
    fireEvent.keyUp(window, { key: "\\" });
    expect(img().style.filter).toContain("invert(1)");
  });

  it("save view: an image saves as PNG with its filters, drawn from the same-origin copy", async () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    const loaded: string[] = [];
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 80;
      naturalHeight = 60;
      set src(v: string) {
        loaded.push(v);
        setTimeout(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const ctx = { filter: "", translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) => cb(new Blob(["png"])));
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() });
    const clicks: HTMLAnchorElement[] = [];
    const aClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this);
    });

    renderDoc("/doc/rec1?inv=1");
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(loaded).toEqual(["/api/file/rec1"]);
    expect(ctx.filter).toContain("invert(1)");
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(clicks.map((a) => a.download)).toEqual(["rec1.png"]);

    vi.unstubAllGlobals();
    getContext.mockRestore();
    toBlob.mockRestore();
    aClick.mockRestore();
  });

  it("minimap: shows while zoomed with the visible area marked; a click there pans to it", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        cb: (e: { contentRect: { width: number; height: number } }[]) => void;
        constructor(cb: (e: { contentRect: { width: number; height: number } }[]) => void) {
          this.cb = cb;
        }
        observe() {
          this.cb([{ contentRect: { width: 400, height: 300 } }]);
        }
        disconnect() {}
      },
    );
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
    const panel = img.closest("[data-chrome]") as HTMLElement;
    panel.getBoundingClientRect = () => ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);
    expect(document.querySelector("[data-minimap]")).toBeNull(); // 1×: nothing to find your way around
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" })); // 2.25×, centred
    const map = document.querySelector("[data-minimap]") as HTMLElement;
    const rect = map.querySelector("[data-minimap-view]") as HTMLElement;
    expect(parseFloat(rect.style.width)).toBeCloseTo(100 / 2.25, 0); // % of the picture
    expect(parseFloat(rect.style.left)).toBeCloseTo((100 - 100 / 2.25) / 2, 0);
    // top-left corner of the minimap → view pans to the picture's top-left edge
    map.getBoundingClientRect = () => ({ width: 88, height: 66, top: 200, left: 300, right: 388, bottom: 266, x: 300, y: 200, toJSON: () => ({}) });
    fireEvent.pointerDown(map, { clientX: 300, clientY: 200, pointerId: 3 });
    expect(parseFloat(rect.style.left)).toBeCloseTo(0, 0);
    expect(parseFloat(rect.style.top)).toBeCloseTo(0, 0);
    vi.unstubAllGlobals();
  });

  it("Shadows slider lifts dark areas with a gamma curve (in the URL as gam=); Night preset sets it", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc("/doc/rec1?gam=170");
    const img = () => document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
    const exp = () => Number(document.querySelector("#ru-gamma feFuncR")!.getAttribute("exponent"));
    expect(img().style.filter).toContain("#ru-gamma");
    expect(exp()).toBeLessThan(1); // > 100 lifts the shadows
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    fireEvent.change(screen.getByLabelText("Shadows"), { target: { value: "100" } });
    expect(img().style.filter).not.toContain("#ru-gamma");
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(img().style.filter).toContain("#ru-gamma");
    expect(screen.getByLabelText("Shadows")).not.toHaveValue("100");
  });

  it("ruler: drag a line, read source pixels, % of frame width and angle; turning it off clears it", () => {
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
    const panel = img.closest("[data-chrome]") as HTMLElement;
    const rect = { width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) };
    panel.getBoundingClientRect = () => rect;
    Object.defineProperty(img, "naturalWidth", { value: 800 });
    Object.defineProperty(img, "naturalHeight", { value: 600 });
    fireEvent.load(img);
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: "Ruler" }));
    const layer = document.querySelector("[data-ruler]") as HTMLElement;
    layer.getBoundingClientRect = () => rect;
    fireEvent.pointerDown(layer, { clientX: 100, clientY: 200, pointerId: 5 });
    fireEvent.pointerMove(layer, { clientX: 300, clientY: 200, pointerId: 5 });
    fireEvent.pointerUp(layer, { clientX: 300, clientY: 200, pointerId: 5 });
    // 200 panel px across an 800 px picture drawn 400 wide = 400 source px = 50% of the width, level
    expect(screen.getByTestId("ruler-label")).toHaveTextContent("400 px · 50.0% W · 0°");
    // straight up = 90°
    fireEvent.pointerDown(layer, { clientX: 200, clientY: 250, pointerId: 6 });
    fireEvent.pointerMove(layer, { clientX: 200, clientY: 150, pointerId: 6 });
    expect(screen.getByTestId("ruler-label")).toHaveTextContent("200 px · 25.0% W · 90°");
    fireEvent.click(screen.getByRole("button", { name: "Ruler" }));
    expect(document.querySelector("[data-ruler]")).toBeNull();
  });

  it("Motion (video): swaps the <video> to the same-origin copy (readable pixels) and lays the motion map over it", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    const video = () => document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    expect(video().getAttribute("src")).toBe("https://cdn.example/clip.mp4");
    expect(document.querySelector("canvas[data-motion]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: "Motion" }));
    expect(video().getAttribute("src")).toBe("/api/file/rec1");
    expect(document.querySelector("canvas[data-motion]")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Motion" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Motion" }));
    expect(video().getAttribute("src")).toBe("https://cdn.example/clip.mp4");
    expect(document.querySelector("canvas[data-motion]")).toBeNull();
  });

  it("help panel lists every tool for this kind of file, with phone gestures on touch screens", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    const { unmount } = renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    const help = () => document.getElementById(screen.getByRole("button", { name: "How to use the media tools" }).getAttribute("aria-controls")!)!;
    const groups = () => [...help().querySelectorAll("h3")].map((h) => h.textContent);
    const names = () => [...help().querySelectorAll("li b")].map((b) => b.textContent);
    expect(groups()).toEqual(["Look closer", "Change the look", "Console styles", "Measure and spot", "Share and save", "Move between files"]);
    expect(names()).toEqual(expect.arrayContaining(["Turn", "Ruler", "See the original", "Save picture", "Night", "Console style", "Presets P1–P4"]));
    expect(names()).not.toContain("Motion"); // video only
    expect(names()).not.toContain("Save frame");
    // test env = touch screen: gestures instead of keys
    const zoom = [...help().querySelectorAll("li")].find((li) => li.querySelector("b")?.textContent === "Zoom in or out")!;
    expect(zoom).toHaveTextContent("Pinch");
    expect(help().querySelector("kbd")).toBeNull();
    unmount();

    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    expect(groups()).toContain("Play the video");
    expect(names()).toEqual(expect.arrayContaining(["Motion", "Save frame", "Play or pause", "Step one frame"]));
    expect(names()).not.toContain("Save picture");
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

    it("media tool filters + lens live in the URL and carry to the next file", () => {
      const image = (d: RecordDetail): RecordDetail => ({
        ...d,
        record: { ...d.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      });
      useRecordMock.mockReturnValue({ data: image(midDetail), isLoading: false });
      const { unmount } = renderDoc("/doc/mid");
      fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
      fireEvent.click(screen.getByRole("button", { name: "Ironbow" }));
      fireEvent.click(screen.getByRole("button", { name: /invert ir/i }));
      fireEvent.click(screen.getByRole("button", { name: "Lens" }));
      fireEvent.click(screen.getByRole("button", { name: /lens magnification 3×/i }));
      fireEvent.click(screen.getByRole("button", { name: /rotate 90/i }));
      fireEvent.click(screen.getByRole("button", { name: /next file/i }));
      const href = mockNavigate.mock.lastCall![0] as string;
      expect(href.split("?")[0]).toBe("/doc/c");
      expect(Object.fromEntries(new URLSearchParams(href.split("?")[1]))).toEqual({ pal: "ironbow", inv: "1", lens: "1", mag: "5" });
      unmount();

      // landing on the next file with those params: same filters, lens still on at 5×, rotation not carried
      useRecordMock.mockReturnValue({ data: image(lastDetail), isLoading: false });
      renderDoc(href);
      const img = document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
      expect(img.style.filter).toContain("invert(1)");
      expect(img.style.filter).toContain("#ru-ironbow");
      expect(img.style.transform).not.toContain("rotate");
      expect(document.querySelector("[data-zoom-lens]")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /lens magnification 5×/i })).toBeInTheDocument();
      // series links keep the tool params (not the list filters)
      expect(screen.getByRole("link", { name: /previous in series/i })).toHaveAttribute("href", "/doc/rec0?inv=1&pal=ironbow&lens=1&mag=5");
    });

    it("bad media tool params fall back to defaults", () => {
      useRecordMock.mockReturnValue({
        data: { ...midDetail, record: { ...midDetail.record, kind: "image" }, assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }] },
        isLoading: false,
      });
      renderDoc("/doc/mid?br=999&pal=evil&mag=7&lens=1");
      const img = document.querySelector('[data-screen="doc"] img') as HTMLImageElement;
      expect(img.style.filter).toBe("brightness(2)");
      fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
      expect(screen.getByRole("button", { name: /lens magnification 3×/i })).toBeInTheDocument();
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

describe("Doc PDF size gate", () => {
  // The panel probes the file size with a 1-byte range request before
  // deciding whether the native viewer may load it inline.
  function mockProbe(bytes: number | null) {
    // desktop viewport: inline PDF <iframe> only renders at >=900px
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("900px"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const fetchMock = vi.fn().mockResolvedValue({
      headers: {
        get: (k: string) =>
          k.toLowerCase() === "content-range" && bytes !== null ? `bytes 0-0/${bytes}` : null,
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function panelFrame(): HTMLIFrameElement | null {
    return document.querySelector('[data-screen="doc"] iframe');
  }

  it("probes the PDF size with a 1-byte range request and embeds small files fitted to the panel width", async () => {
    const fetchMock = mockProbe(1_417_100);
    renderDoc();
    await waitFor(() => expect(panelFrame()).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/file/rec1", { headers: { Range: "bytes=0-0" } });
    // view=FitH: pages fit the box width, never wider than the panel
    expect(panelFrame()!.getAttribute("src")).toBe("/api/file/rec1#view=FitH");
  });

  it("keeps the ?p=N deep-link page when fitting the viewer to the panel width", async () => {
    mockProbe(1_417_100);
    renderDoc("/doc/rec1?p=3");
    await waitFor(() => expect(panelFrame()).not.toBeNull());
    expect(panelFrame()!.getAttribute("src")).toBe("/api/file/rec1#page=3&view=FitH");
  });

  it("gates huge PDFs behind an explicit open button instead of auto-loading the file", async () => {
    mockProbe(200 * 1024 * 1024);
    renderDoc();
    await screen.findByText(/too big to preview inline/);
    expect(screen.getByText(/200\.0 MB/)).toBeInTheDocument();
    // no iframe: the giant scan never rasterizes inside this tab
    expect(panelFrame()).toBeNull();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByRole("button", { name: /OPEN FULL PDF/i }));
    expect(openSpy).toHaveBeenCalledWith("/api/file/rec1", "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("falls back to the inline viewer when the size probe fails", async () => {
    mockProbe(null);
    renderDoc();
    await waitFor(() => expect(panelFrame()).not.toBeNull());
  });
});

describe("Media console", () => {
  it("Reset zoom sits right after Zoom in (parent, then its modifier)", () => {
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
    Object.defineProperty(img(), "naturalWidth", { configurable: true, value: 1600 });
    Object.defineProperty(img(), "naturalHeight", { configurable: true, value: 1000 });
    fireEvent.load(img());
    fireEvent.click(screen.getByRole("button", { name: /adjust/i })); // tools hide inside the Adjust panel
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const reset = screen.getByRole("button", { name: "Reset zoom" });
    expect(reset.previousElementSibling).toBe(zoomIn); // no divider between them: one zoom cluster
    // Lens magnification keeps the same pattern after Lens
    fireEvent.click(screen.getByRole("button", { name: "Lens" }));
    const lens = screen.getByRole("button", { name: "Lens" });
    const mag = screen.getByRole("button", { name: /lens magnification/i });
    expect(mag.previousElementSibling).toBe(lens);
  });

  it("the style picker switches the console body and remembers the choice", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    fireEvent.click(screen.getByRole("button", { name: "Console style" }));
    const chaban = screen.getByRole("button", { name: /DJ desk/ });
    expect(chaban).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chaban);
    expect(localStorage.getItem("ru:media-skin")).toBe("chaban");
    // the DJ desk deck renders (Simple has no sliders with this role)
    expect(screen.getByRole("slider", { name: "Zoom wheel" })).toBeInTheDocument();
    // remembered: reopening the picker shows DJ desk ticked
    fireEvent.click(screen.getByRole("button", { name: "Console style" }));
    expect(screen.getByRole("button", { name: /DJ desk/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("P2 applies the Night hunt look; the floppy saves the current setup to a slot", () => {
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "image" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/photo.jpg", mime: "image/jpeg", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    fireEvent.click(screen.getByRole("button", { name: "Preset 2: Night hunt" }));
    expect((screen.getByLabelText("Shadows") as HTMLInputElement).value).toBe("170");
    expect(screen.getByRole("button", { name: "Preset 2: Night hunt" })).toHaveAttribute("aria-pressed", "true");
    // 2 on the keyboard applies P2 as well
    fireEvent.click(screen.getByRole("button", { name: "Preset 1: Clean" }));
    fireEvent.keyDown(window, { key: "2" });
    expect((screen.getByLabelText("Shadows") as HTMLInputElement).value).toBe("170");
    // save the current (clean) setup into P1
    fireEvent.click(screen.getByRole("button", { name: "Preset 1: Clean" }));
    fireEvent.click(screen.getByRole("button", { name: /save the current setup/i }));
    fireEvent.click(screen.getByRole("button", { name: /save to preset 1/i }));
    const saved = JSON.parse(localStorage.getItem("ru:media-presets")!);
    expect(saved.presets[0].name).toBe("Your setup");
    expect(saved.presets[1].name).toBe("Night hunt"); // other slots untouched
  });

  it("DJ desk deck: wheel arrow keys step frames, the knob turns the magnifier", () => {
    localStorage.setItem("ru:media-skin", "chaban");
    useRecordMock.mockReturnValue({
      data: {
        ...mockDetail,
        record: { ...mockDetail.record, kind: "video" },
        assets: [{ role: "full", cdn_url: "https://cdn.example/clip.mp4", mime: "video/mp4", width: null, height: null }],
      },
      isLoading: false,
    });
    renderDoc();
    fireEvent.click(screen.getByRole("button", { name: /adjust/i }));
    const video = document.querySelector('[data-screen="doc"] video') as HTMLVideoElement;
    video.currentTime = 10;
    const wheel = screen.getByRole("slider", { name: "Scrub frames" });
    fireEvent.keyDown(wheel, { key: "ArrowRight" });
    expect(video.currentTime).toBeCloseTo(10 + 1 / 30, 5);
    fireEvent.keyDown(wheel, { key: "ArrowLeft" });
    expect(video.currentTime).toBeCloseTo(10, 5);
    // the knob steps 3× → 5× → 8×
    const knob = screen.getByRole("slider", { name: "Lens" });
    expect(knob).toHaveAttribute("aria-valuenow", "3");
    fireEvent.keyDown(knob, { key: "ArrowUp" });
    expect(knob).toHaveAttribute("aria-valuenow", "5");
    // wheel centre = play/pause (inside the wheel; the transport row has its own Play)
    expect(within(wheel).getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(knob).toBeInTheDocument(); // deck stays put
  });
});
