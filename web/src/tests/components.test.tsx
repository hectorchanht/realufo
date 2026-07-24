// Unit tests for the reusable content components (Task 15).
// `useVote` is mocked entirely here — the real optimistic cache-update logic
// is already covered by tests/queries.test.tsx; these tests only assert that
// VoteButton *calls* the mutation with the right target and reflects an
// immediate local-optimistic toggle in its own display.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
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
// Mutable per-test bootstrap fixture for DocCard's `useBootstrap()` archive
// -accent lookup — `undefined` (the default) exercises the "bootstrap hasn't
// loaded yet" fallback-to-signal path; individual tests below override it to
// exercise the "resolve the archive's own accent" path.
let mockBootstrapArchives: Archive[] | undefined;
vi.mock("../api/queries", () => ({
  useVote: () => ({ mutate: mockMutate, isPending: false }),
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
    expect(mockMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" });
  });

  it("optimistically toggles the displayed count on click (5 -> 4 when already voted)", () => {
    render(<VoteButton targetType="thread" targetId="th1" votes={5} voted />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});

describe("DocCard", () => {
  const feedRecord: FeedRecordCard = {
    id: "rec1",
    archive: "wargov",
    agency: "CIA",
    title: "CIA-UAP-017, Placement on High Alert",
    summary: "summary text",
    kind: "pdf",
    redacted: 0,
    thumb: null,
    credible: 240,
    commentN: 12,
  };

  it("renders title and agency badge", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.getByText(/CIA-UAP-017/)).toBeInTheDocument();
    expect(screen.getByText("CIA")).toBeInTheDocument();
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

  it("shows a REDACTED chip only when record.redacted is truthy", () => {
    const { rerender } = render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.queryByText("REDACTED")).not.toBeInTheDocument();

    rerender(withRouter(<DocCard record={{ ...feedRecord, redacted: 1 }} variant="feed" />));
    expect(screen.getByText("REDACTED")).toBeInTheDocument();
  });

  it("shows the video play glyph when kind is 'video'", () => {
    render(withRouter(<DocCard record={{ ...feedRecord, kind: "video" }} variant="feed" />));
    expect(screen.getByText("▶")).toBeInTheDocument();
  });

  it("does not show the play glyph for non-video kinds", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    expect(screen.queryByText("▶")).not.toBeInTheDocument();
  });

  it("shows the diagonal-hatch fallback glyph (type glyph) when there is no thumb", () => {
    render(withRouter(<DocCard record={feedRecord} variant="feed" />));
    // no thumb -> hatch placeholder renders the type glyph instead of an <img>
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("grid/archive variant shows locOrDate footer instead of credible/commentN", () => {
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

  it("calls onOpen instead of navigating when provided", () => {
    const onOpen = vi.fn();
    render(withRouter(<DocCard record={feedRecord} variant="feed" onOpen={onOpen} />));
    fireEvent.click(screen.getByRole("link"));
    expect(onOpen).toHaveBeenCalledWith("rec1");
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
    expect(mockMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" });
  });

  it("shows the op preview text", () => {
    render(withRouter(<ThreadRow thread={thread} />));
    expect(screen.getByText(/Saw three lights/)).toBeInTheDocument();
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
