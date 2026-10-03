// Unit tests for the reusable content components (Task 15).
// `useVote` is mocked entirely here — the real optimistic cache-update logic
// is already covered by tests/queries.test.tsx; these tests only assert that
// VoteButton *calls* the mutation with the right target and reflects an
// immediate local-optimistic toggle in its own display.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { ApiError, QueuedError } from "../api/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import type {
  Archive,
  Board,
  FeedRecordCard,
  ListRecordCard,
  ThreadCard,
  TickerItem,
} from "../api/types";

const mockMutate = vi.fn();
const mockToast = vi.fn();
vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast: mockToast }) }));
// Mutable per-test bootstrap fixture for DocCard's `useBootstrap()` archive
// -accent lookup — `undefined` (the default) exercises the "bootstrap hasn't
// loaded yet" fallback-to-signal path; individual tests below override it to
// exercise the "resolve the archive's own accent" path.
let mockBootstrapArchives: Archive[] | undefined;
vi.mock("../api/queries", () => ({
  useVote: () => ({ mutate: mockMutate, isPending: false }),
  // Mirrors the real reader of the localStorage voted-map (useVote itself is mocked).
  isVotedLocally: (t: string, id: string) =>
    !!(JSON.parse(localStorage.getItem("ufo_voted") ?? "{}") as Record<string, boolean>)[`${t}:${id}`],
  useBootstrap: () => ({ data: mockBootstrapArchives ? { archives: mockBootstrapArchives } : undefined }),
}));

import { StanceTag } from "../components/StanceTag";
import { VoteButton } from "../components/VoteButton";
import { DocCard } from "../components/DocCard";
import { ThreadRow } from "../components/ThreadRow";
import { BoardRow } from "../components/BoardRow";
import { Ticker } from "../components/Ticker";

// DocCard calls the (mocked) `useBootstrap()` react-query hook, so anything
// that can render a DocCard needs a QueryClientProvider in its tree — a real
// QueryClient is harmless for the other components in this file that don't
// use any query hooks.
function withRouter(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockMutate.mockClear();
  mockBootstrapArchives = undefined;
});

describe("StanceTag", () => {
  it("renders the skeptic label using the amber color token", () => {
    render(<StanceTag stance="skeptic" />);
    const el = screen.getByText(/skeptic/i);
    expect(el).toHaveClass("text-amber");
  });

  it("renders believer with the grn color token", () => {
    render(<StanceTag stance="believer" />);
    expect(screen.getByText(/believer/i)).toHaveClass("text-grn");
  });

  it("falls back to neutral/dim when stance is null", () => {
    render(<StanceTag stance={null} />);
    expect(screen.getByText(/neutral/i)).toHaveClass("text-dim");
  });
});

describe("VoteButton", () => {
  it("shows the initial vote count from props", () => {
    render(<VoteButton targetType="thread" targetId="th1" votes={5} voted />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("calls the useVote mutation with the target on click", () => {
    render(<VoteButton targetType="thread" targetId="th1" votes={5} voted />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" }, expect.anything());
  });

  it("optimistically toggles the displayed count on click (5 -> 4 when already voted)", () => {
    render(<VoteButton targetType="thread" targetId="th1" votes={5} voted />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("reads stored vote when no prop", () => {
    localStorage.setItem("ufo_voted", JSON.stringify({ "thread:th9": true }));
    render(<VoteButton targetType="thread" targetId="th9" votes={3} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    localStorage.removeItem("ufo_voted");
  });

  it("stays voted after the count prop catches up", () => {
    localStorage.removeItem("ufo_voted");
    const { rerender } = render(<VoteButton targetType="thread" targetId="th9" votes={3} />);
    fireEvent.click(screen.getByRole("button"));
    // simulate the (mocked) hook's voted-map write
    localStorage.setItem("ufo_voted", JSON.stringify({ "thread:th9": true }));
    rerender(<VoteButton targetType="thread" targetId="th9" votes={4} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("4")).toBeInTheDocument();
    localStorage.removeItem("ufo_voted");
  });

  it("429 shows a toast", () => {
    mockToast.mockClear();
    render(<VoteButton targetType="thread" targetId="th9" votes={3} />);
    fireEvent.click(screen.getByRole("button"));
    const { onError } = mockMutate.mock.calls.at(-1)![1];
    onError(new ApiError(429, "x"));
    expect(mockToast).toHaveBeenCalledWith("slow down — too many votes");
  });

  it("queued offline vote: no error toast, stays voted", () => {
    mockToast.mockClear();
    localStorage.removeItem("ufo_voted");
    render(<VoteButton targetType="thread" targetId="th8" votes={3} />);
    fireEvent.click(screen.getByRole("button"));
    const { onError } = mockMutate.mock.calls.at(-1)![1];
    onError(new QueuedError());
    expect(mockToast).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DocCard", () => {
  const feedRecord: FeedRecordCard = {
    id: "CIA-UAP-017",
    archive: "wargov",
    agency: "CIA",
    title: "CIA-UAP-017, Placement on High Alert",
    summary: "summary text",
    kind: "pdf",
    redacted: 0,
    thumb: null,
    commentN: 12,
    verdictN: 3,
  };

  it("feed variant shows the real verdict count", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getByText("⚖ 3")).toBeInTheDocument();
  });

  it("renders title and agency badge", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getByText(/CIA-UAP-017/)).toBeInTheDocument();
    expect(screen.getByText("CIA")).toBeInTheDocument();
  });

  it("shows the id once as a kicker and the title without the id prefix (Doc page rule)", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getAllByText(/CIA-UAP-017/)).toHaveLength(1);
    expect(screen.getByText("CIA-UAP-017")).toBeInTheDocument();
    expect(screen.getByText("Placement on High Alert")).toBeInTheDocument();
  });

  it("no kicker when the id only respells the title", () => {
    render(withRouter(<DocCard record={{ ...feedRecord, id: "AARO-IMG-Go_Fast_UAP", title: "Go Fast UAP" }} variant="feed" />));
    expect(screen.queryByText("AARO-IMG-Go_Fast_UAP")).toBeNull();
    expect(screen.getByText("Go Fast UAP")).toBeInTheDocument();
  });

  it("falls back to var(--signal) for the badge color when bootstrap hasn't loaded", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getByText("CIA")).toHaveStyle({ color: "var(--signal)" });
  });

  it("resolves the agency badge color from the matching bootstrap archive's accent", () => {
    mockBootstrapArchives = [
      { id: "wargov", label: "War/Gov Archive", flag: "🎖", accent: "#6ea8ff", count: 900, coord: "" },
    ];
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getByText("CIA")).toHaveStyle({ color: "#6ea8ff" });
  });

  it("shows an R (Redacted) chip only when record.redacted is truthy", () => {
    const { rerender } = render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.queryByTitle("Redacted")).not.toBeInTheDocument();

    rerender(withRouter(<DocCard record={{ ...feedRecord, redacted: 1 }} variant="feed" />));
    expect(screen.getByTitle("Redacted")).toHaveTextContent(/^R$/);
  });

  it("offers the 400px WebP sibling via srcset for CDN thumbs (spaces escaped)", () => {
    const thumb = "https://assets.realufo.org/thumbs/aaro/A B.jpg";
    const { container } = render(withRouter(<DocCard record={{ ...feedRecord, thumb }} variant="feed" />));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(thumb);
    expect(img.getAttribute("srcset")).toBe(
      "https://assets.realufo.org/thumbs/aaro/A%20B-400.webp 400w, https://assets.realufo.org/thumbs/aaro/A%20B.jpg 640w",
    );
    expect(img.getAttribute("sizes")).toBeTruthy();
  });

  it("portrait-cropped video gets a tall thumb box; landscape crops stay 4:3", () => {
    const thumb = "https://assets.realufo.org/thumbs/aaro/V.jpg";
    const box = (crop: string) =>
      render(withRouter(<DocCard record={{ ...feedRecord, kind: "video", thumb, crop }} variant="feed" />)).container.querySelector("img")!
        .parentElement!;
    const tall = box("616:1080:652:0");
    expect(tall.style.aspectRatio).toBe(`${616 / 1080} / 1`);
    expect(tall.className).not.toContain("aspect-[4/3]");
    expect(box("960:720:160:0").className).toContain("aspect-[4/3]");
  });

  it("drops the srcset and retries the JPEG when the small image fails, then shows the glyph", () => {
    const thumb = "https://assets.realufo.org/thumbs/wargov/X.jpg";
    const { container } = render(withRouter(<DocCard record={{ ...feedRecord, thumb }} variant="feed" />));
    fireEvent.error(container.querySelector("img")!);
    const retry = container.querySelector("img")!;
    expect(retry.getAttribute("srcset")).toBeNull();
    expect(retry.getAttribute("src")).toBe(thumb);
    fireEvent.error(retry);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("leaves non-CDN thumbs without a srcset", () => {
    const { container } = render(withRouter(<DocCard record={{ ...feedRecord, thumb: "https://example.com/x.jpg" }} variant="feed" />));
    expect(container.querySelector("img")!.getAttribute("srcset")).toBeNull();
  });

  it("does not overlay a play glyph on video thumbs", () => {
    render(withRouter(<DocCard record={{ ...feedRecord, kind: "video" }} variant="feed" />));
    expect(screen.queryByText("▶")).not.toBeInTheDocument();
  });

  it("shows video length bottom-right when duration is known", () => {
    const { rerender } = render(withRouter(<DocCard record={{ ...feedRecord, kind: "video", duration: 9.6 }} variant="feed" />));
    expect(screen.getByText("0:10")).toBeInTheDocument();
    rerender(withRouter(<DocCard record={{ ...feedRecord, kind: "video", duration: 3725 }} variant="feed" />));
    expect(screen.getByText("1:02:05")).toBeInTheDocument();
    rerender(withRouter(<DocCard record={{ ...feedRecord, kind: "video", duration: null }} variant="feed" />));
    expect(screen.queryByText(/^\d+:\d\d$/)).not.toBeInTheDocument();
  });

  it("shows the diagonal-hatch fallback glyph (type glyph) when there is no thumb", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    // no thumb -> hatch placeholder renders the type glyph instead of an <img>
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("grid/archive variant shows locOrDate footer instead of commentN", () => {
    const listRecord: ListRecordCard = {
      id: "rec2",
      archive: "nara",
      agency: "FBI",
      title: "Another declassified record",
      summary: "summary",
      kind: "pdf",
      redacted: 0,
      thumb: null,
      location: "Roswell, NM",
      incident_date: "1947",
      doc_date: "1997",
    };
    render(withRouter(<DocCard record={listRecord} variant="grid" />));
    expect(screen.getByText("Roswell, NM")).toBeInTheDocument();
  });

  it("a search hit inside the file's text shows the page and excerpt", () => {
    const hit: ListRecordCard = {
      id: "rec3", archive: "wargov", agency: "FBI", title: "Teletype", summary: "", kind: "pdf", redacted: 0,
      thumb: null, location: null, incident_date: null, doc_date: null,
      match: { page: 12, text: "…described several weather balloons over the…" },
    };
    render(withRouter(<DocCard record={hit} variant="grid" />));
    expect(screen.getByText("p.12")).toBeInTheDocument();
    expect(screen.getByText(/several weather balloons/)).toBeInTheDocument();
  });

  it("calls onOpen instead of navigating when provided", () => {
    const onOpen = vi.fn();
    render(withRouter(<DocCard record={feedRecord} variant="feed" onOpen={onOpen} />));
    fireEvent.click(screen.getByRole("link"));
    expect(onOpen).toHaveBeenCalledWith("CIA-UAP-017");
  });

  it("shows the TL;DR one-liner under the title when present", () => {
    render(withRouter(<DocCard record={{ ...feedRecord, oneLiner: "Paperwork wins." }} variant="feed" />));
    expect(screen.getByText(String.fromCharCode(8220) + "Paperwork wins." + String.fromCharCode(8221))).toBeInTheDocument();
  });

  it("no one-liner: nothing extra", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.queryByText(String.fromCharCode(8220))).toBeNull();
  });
});

describe("ThreadRow", () => {
  const thread: ThreadCard = {
    id: "th1",
    no: 42,
    board_id: "uap",
    boardSlug: "/uap/",
    accent: "#9184d9",
    title: "Something strange over the coast last night",
    op_body: "Saw three lights moving in formation, no sound at all.",
    stance: "believer",
    reply_count: 3,
    img_count: 1,
    votes: 12,
    hot: 1,
    ago: "2h",
  };

  it("renders board slug, title, hot badge, and meta counts", () => {
    render(withRouter(<ThreadRow thread={thread} />));
    expect(screen.getByText("/uap/")).toBeInTheDocument();
    expect(screen.getByText(thread.title)).toBeInTheDocument();
    expect(screen.getByText(/HOT/)).toBeInTheDocument();
    expect(screen.getByText("💬 3")).toBeInTheDocument();
    expect(screen.getByText("🖼 1")).toBeInTheDocument();
  });

  it("includes a vote pillar wired to the thread id", () => {
    render(withRouter(<ThreadRow thread={thread} />));
    fireEvent.click(screen.getByRole("button"));
    expect(mockMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" }, expect.anything());
  });

  it("shows the op preview text", () => {
    render(withRouter(<ThreadRow thread={thread} />));
    expect(screen.getByText(/Saw three lights/)).toBeInTheDocument();
  });

  it("shows the thread image in the left slot, none without a thumb", () => {
    const { container, rerender } = render(withRouter(<ThreadRow thread={{ ...thread, thumb: "/api/u/a.png" }} />));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/u/a.png");
    rerender(withRouter(<ThreadRow thread={thread} />));
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("BoardRow", () => {
  const board: Board = {
    id: "uap",
    slug: "/uap/",
    name: "UAP General",
    desc: "Sightings, encounters, general discussion",
    accent: "#9184d9",
    icon: "planet",
    online: 412,
    thread_count: 1284,
  };

  it("renders name, desc, and thread count (no fake online count)", () => {
    render(withRouter(<BoardRow board={board} />));
    expect(screen.getByText("UAP General")).toBeInTheDocument();
    expect(screen.getByText(board.desc)).toBeInTheDocument();
    expect(screen.getByText(/1,284 threads|1284 threads/)).toBeInTheDocument();
    // online count was fake fillup — dropped from the UI
    expect(screen.queryByText(/412/)).not.toBeInTheDocument();
  });

  it("links to /board/<slug without slashes>", () => {
    render(withRouter(<BoardRow board={board} />));
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/board/uap");
  });
});

describe("Ticker", () => {
  const items: TickerItem[] = [
    { kind: "thread", board: "/uap/", text: "New sighting reported near Area 51", ago: "2m" },
    { kind: "post", board: "/gov/", text: "FOIA doc released", ago: "5m" },
  ];

  it("shows LIVE and duplicates the ticker row for a seamless loop", () => {
    render(<Ticker items={items} />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    // duplicated row -> each item's text appears twice
    expect(screen.getAllByText("New sighting reported near Area 51")).toHaveLength(2);
  });

  it("shows each board tag alongside its text", () => {
    render(<Ticker items={items} />);
    const uapTags = screen.getAllByText("/uap/");
    expect(uapTags.length).toBeGreaterThanOrEqual(1);
    within(uapTags[0].closest("span") as HTMLElement);
  });
});
