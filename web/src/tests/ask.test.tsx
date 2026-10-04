import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client";
import { AskAnswer } from "../components/AskAnswer";
import { renderAppAt } from "./util";
import { ASK_HISTORY_KEY } from "../lib/askHistory";

const useAskMock = vi.fn();
const useAskRecentMock = vi.fn();
const shareMutate = vi.fn();
let askFeature = true;
vi.mock("../api/queries", () => ({
  useAsk: (q: string) => useAskMock(q),
  useAskRecent: () => useAskRecentMock(),
  useShareAsk: () => ({ mutate: shareMutate, isPending: false }),
  useAddComment: () => ({ mutate: vi.fn(), isPending: false }),
  useAddCaseComment: () => ({ mutate: vi.fn(), isPending: false }),
  useReply: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateThread: () => ({ mutate: vi.fn(), isPending: false }),
  useFacets: () => ({ data: undefined }),
  useBootstrap: () => ({
    data: { archives: [], boards: [], stats: { records: 2 }, ticker: [], sightings: [], cases: [], features: { ask: askFeature } },
    isLoading: false,
  }),
  useRecords: () => ({ data: { count: 0, records: [] }, isLoading: false, isPlaceholderData: false }),
  useShorts: () => ({ data: [] }),
  useHubs: () => ({ data: { hubs: [{ kind: "agency", slug: "fbi", label: "FBI", count: 104, values: ["FBI"] }] } }),
}));

const shareLinkMock = vi.fn();
vi.mock("../lib/shareLink", async (orig) => ({
  ...(await orig<typeof import("../lib/shareLink")>()),
  shareLink: (t: string, u: string) => shareLinkMock(t, u),
}));

const answered = {
  data: {
    answer: "Radar tracked it [1] and pilots saw it [2].",
    cached: false,
    sources: [
      { n: 1, record_id: "DOE-UAP-D004", title: "Los Alamos Conference", page: 3, kind: "pdf", thumb: null },
      { n: 2, record_id: "WARGOV-VID-1", title: "Gimbal", page: 0, kind: "video", thumb: "/t.jpg" },
    ],
  },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
};
const renderCard = () => render(<MemoryRouter><AskAnswer question="what did radar see?" /></MemoryRouter>);

beforeEach(() => {
  useAskMock.mockReset();
  shareMutate.mockReset();
  shareLinkMock.mockReset();
});

describe("AskAnswer", () => {
  it("hub chips wrap on their own line under the title (title never squeezed out on phones)", () => {
    useAskMock.mockReturnValue({
      ...answered,
      data: { ...answered.data, sources: [{ ...answered.data.sources[0], hubs: { agency: "fbi", release: "6" } }] },
    });
    renderCard();
    const chips = screen.getByRole("link", { name: "R06" }).parentElement!;
    expect(chips.className).toContain("flex-wrap");
    const title = screen.getByRole("link", { name: /Los Alamos Conference/ });
    expect(title.parentElement).toBe(chips.parentElement); // title + chips stacked in one shrinkable column
    expect(title.parentElement!.className).toContain("min-w-0");
  });

  it("source rows link their hubs as chips; sources without hubs get none", () => {
    useAskMock.mockReturnValue({
      ...answered,
      data: { ...answered.data, sources: [{ ...answered.data.sources[0], hubs: { agency: "fbi", release: "6", decade: "1950s" } }, answered.data.sources[1]] },
    });
    renderCard();
    expect(screen.getByRole("link", { name: "FBI" })).toHaveAttribute("href", "/agency/fbi");
    expect(screen.getByRole("link", { name: "R06" })).toHaveAttribute("href", "/release/6");
    expect(screen.getByRole("link", { name: "1950s" })).toHaveAttribute("href", "/decade/1950s");
    const second = document.getElementById("ask-src-2")!;
    expect(second.querySelectorAll('a[href^="/agency/"], a[href^="/release/"], a[href^="/decade/"], a[href^="/location/"]').length).toBe(0);
  });

  it("sources that matched AI-written text say so; the file's own text gets no label", () => {
    useAskMock.mockReturnValue({
      ...answered,
      data: { ...answered.data, sources: [answered.data.sources[0], { ...answered.data.sources[1], ai: "moments" }] },
    });
    renderCard();
    const label = screen.getByText("AI");
    expect(label).toHaveAttribute("title", expect.stringMatching(/AI-written/));
    expect(document.getElementById("ask-src-2")).toContainElement(label);
    expect(document.getElementById("ask-src-1")!.textContent).not.toMatch(/AI /);
  });

  it("source rows show the file id above a title that is not truncated by its chips", () => {
    useAskMock.mockReturnValue({
      ...answered,
      data: { ...answered.data, sources: [{ n: 1, record_id: "WARGOV-VID-9", title: "DOW-UAP-PR104, Unresolved UAP Report, Yellow Sea, 2025", page: 0, kind: "video", thumb: null, ai: "moments" }] },
    });
    renderCard();
    const link = screen.getByRole("link", { name: /Unresolved UAP Report, Yellow Sea, 2025/ });
    expect(link).toHaveTextContent("DOW-UAP-PR104 (video)");
    expect(screen.getByText("Unresolved UAP Report, Yellow Sea, 2025").className).toContain("line-clamp-2");
    expect(screen.getByText("AI").parentElement!.className).toContain("flex-wrap"); // AI chip rides the chip row
  });

  it("renders the answer as text with citation buttons and numbered sources", () => {
    useAskMock.mockReturnValue(answered);
    renderCard();
    expect(useAskMock).toHaveBeenCalledWith("what did radar see?");
    expect(screen.getByText("◉ ARCHIVE ANSWER")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "source 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Los Alamos Conference/ })).toHaveAttribute("href", "/doc/DOE-UAP-D004");
    expect(screen.getByRole("link", { name: "open at p.3" })).toHaveAttribute("href", "/api/file/DOE-UAP-D004#page=3");
    expect(screen.queryByRole("link", { name: /open at p\.0/ })).toBeNull();       // video: no page link
    expect(screen.getByText(/can be wrong\. Check the sources\./)).toBeInTheDocument();
  });

  it("never renders answer text as HTML", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, answer: "<img src=x onerror=alert(1)> [1]" } });
    const { container } = renderCard();
    expect(container.querySelector("img[src='x']")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
  });

  it("post to a board hands the answer to onPost; hidden without sources or without onPost", () => {
    useAskMock.mockReturnValue(answered);
    const onPost = vi.fn();
    const { rerender } = render(<MemoryRouter><AskAnswer question="what did radar see?" onPost={onPost} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "⤴ post to a board" }));
    expect(onPost).toHaveBeenCalledWith(answered.data);

    rerender(<MemoryRouter><AskAnswer question="what did radar see?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "⤴ post to a board" })).toBeNull();

    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, sources: [] } });
    rerender(<MemoryRouter><AskAnswer question="what did radar see?" onPost={onPost} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "⤴ post to a board" })).toBeNull();
  });

  it("share publishes the answer, opens the share sheet, then offers share link / X / undo", async () => {
    shareLinkMock.mockResolvedValue("copied");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    expect(shareMutate).toHaveBeenCalledWith({ id: 7, public: true }, expect.anything());
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));
    expect(shareLinkMock).toHaveBeenCalledWith("what did radar see?", "/ask/7-what-did-radar-see");
    expect(screen.getByText("✓ shared")).toBeInTheDocument();
    expect(screen.getByText("link copied")).toBeInTheDocument();
    const x = screen.getByRole("link", { name: "Post on X" });
    expect(x.getAttribute("href")).toContain("https://x.com/intent/post?text=what%20did%20radar%20see%3F&url=");
    expect(x).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    expect(shareLinkMock).toHaveBeenLastCalledWith("what did radar see?", "/ask/7-what-did-radar-see");

    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    expect(shareMutate).toHaveBeenLastCalledWith({ id: 7, public: false }, expect.anything());
    act(() => shareMutate.mock.calls.at(-1)![1].onSuccess({ public: false, url: "/ask/7-what-did-radar-see" }));
    expect(screen.getByRole("button", { name: "share" })).toBeInTheDocument();
  });

  it("a failed undo says so, stays shared, and the message clears on a later undo", async () => {
    shareLinkMock.mockResolvedValue("copied");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));

    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    act(() => shareMutate.mock.calls.at(-1)![1].onError(new Error("boom")));
    expect(screen.getByText("couldn't undo — try again")).toBeInTheDocument();
    expect(screen.getByText("✓ shared")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "undo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "undo" }));
    expect(screen.queryByText("couldn't undo — try again")).toBeNull();
  });

  it("share state resets when the card switches to a different answer", async () => {
    shareLinkMock.mockResolvedValue("copied");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    const { rerender } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));
    expect(screen.getByText("✓ shared")).toBeInTheDocument();
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 8 } });
    rerender(<MemoryRouter><AskAnswer question="another?" /></MemoryRouter>);
    expect(screen.queryByText("✓ shared")).toBeNull();
    expect(screen.getByRole("button", { name: "share" })).toBeInTheDocument();
  });

  it("when neither share sheet nor clipboard works, the link is shown to copy by hand", async () => {
    shareLinkMock.mockResolvedValue("failed");
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true, url: "/ask/7-what-did-radar-see" }));
    expect(screen.getByDisplayValue(/^https?:\/\/[^/]+\/ask\/7-what-did-radar-see$/)).toBeInTheDocument();
  });

  it("a failed share POST says so and keeps the share button", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    act(() => shareMutate.mock.calls[0][1].onError(new Error("429")));
    expect(screen.getByText("couldn't share — try again")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "share" })).toBeInTheDocument();
    expect(shareLinkMock).not.toHaveBeenCalled();
  });

  it("no share button without a log id or without sources", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: null } });
    const { rerender } = renderCard();
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7, sources: [] } });
    rerender(<MemoryRouter><AskAnswer question="q2?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "share" })).toBeNull();
  });

  it("citation button highlights its source row", () => {
    useAskMock.mockReturnValue(answered);
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "source 2" }));
    expect(document.getElementById("ask-src-2")).toHaveAttribute("data-flash", "true");
    expect(document.getElementById("ask-src-1")).toHaveAttribute("data-flash", "false");
  });

  it("shows loading, not-covered, 429, 503 and generic error states", () => {
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    const { rerender } = renderCard();
    expect(screen.getByText("◉ consulting the archive…")).toBeInTheDocument();

    const states: [unknown, string][] = [
      [new ApiError(429, "x"), "slow down — too many questions"],
      [new ApiError(503, "x"), "Ask is resting — try again later"],
      [new Error("net"), "Couldn't reach the archive — try again"],
    ];
    for (const [error, copy] of states) {
      useAskMock.mockReturnValue({ data: undefined, isLoading: false, error, refetch: vi.fn() });
      rerender(<MemoryRouter><AskAnswer question="q?" /></MemoryRouter>);
      expect(screen.getByText(copy)).toBeInTheDocument();
    }
    const refetch = vi.fn();
    useAskMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error("net"), refetch });
    rerender(<MemoryRouter><AskAnswer question="q?" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();

    useAskMock.mockReturnValue({
      data: { answer: "The archive doesn't seem to cover that. Try different words.", sources: [], cached: false },
      isLoading: false, error: null, refetch: vi.fn(),
    });
    rerender(<MemoryRouter><AskAnswer question="q?" /></MemoryRouter>);
    expect(screen.getByText(/doesn't seem to cover that/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("Ask screen", () => {
  beforeEach(() => {
    askFeature = true;
    useAskMock.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    useAskRecentMock.mockReturnValue({ data: undefined });
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());
  // The box can show before Ask's mount effects run (slow machines), and its
  // `setInput(ask)` effect would then wipe what the test types. The AppBar
  // title is set by an effect in the same commit, so once it shows they've run.
  const box = async () => {
    await screen.findByText("ASK THE ARCHIVE");
    return screen.getByPlaceholderText(/ask the archive — e\.g\./);
  };

  it("shared questions with a page link to it (free); older ones re-ask", async () => {
    useAskRecentMock.mockReturnValue({
      data: {
        recent: [
          { id: 12, question: "What about Gimbal?", sources: 2, asked_at: "2026-10-02 08:00:00", url: "/ask/12-what-about-gimbal" },
          { id: 3, question: "Old one?", sources: 1, asked_at: "2026-10-01 08:00:00", url: null },
        ],
      },
    });
    renderAppAt("/ask");
    expect(await screen.findByRole("link", { name: /What about Gimbal\?/ })).toHaveAttribute("href", "/ask/12-what-about-gimbal");
    expect(screen.getByRole("button", { name: /Old one\?/ })).toBeInTheDocument();
  });

  it("with no question shows your questions and shared questions; tapping one asks it", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Earlier question one"]));
    useAskRecentMock.mockReturnValue({
      data: { recent: [{ question: "What about Gimbal?", sources: 2, asked_at: "2026-10-02 08:00:00" }] },
    });
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderAppAt("/ask");
    expect(await screen.findByText("YOUR QUESTIONS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier question one" })).toBeInTheDocument();
    expect(screen.getByText("SHARED QUESTIONS")).toBeInTheDocument();
    expect(screen.getByText("2 sources")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /What about Gimbal\?/ }));
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("What about Gimbal?");
    expect(screen.queryByText("SHARED QUESTIONS")).toBeNull(); // lists hide while an answer is open
    expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)[0]).toBe("What about Gimbal?");
  });

  it("typing sends nothing; Enter asks, saves it to your questions and shows the card", async () => {
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderAppAt("/ask");
    const input = await box();
    fireEvent.change(input, { target: { value: "  what did radar see?  " } });
    expect(useAskMock).not.toHaveBeenCalledWith(expect.stringContaining("radar"));
    fireEvent.submit(input.closest("form")!);
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("what did radar see?");
    expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)).toEqual(["what did radar see?"]);
  });

  it("clear button empties your questions", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Old one"]));
    renderAppAt("/ask");
    fireEvent.click(await screen.findByRole("button", { name: "Clear your questions" }));
    expect(screen.queryByRole("button", { name: "Old one" })).toBeNull();
    expect(localStorage.getItem(ASK_HISTORY_KEY)).toBeNull();
  });

  it("post to a board opens the new-thread composer pre-filled from the answer", async () => {
    useAskMock.mockReturnValue(answered);
    renderAppAt("/ask?q=what%20did%20radar%20see%3F");
    fireEvent.click(await screen.findByRole("button", { name: "⤴ post to a board" }));
    expect(await screen.findByPlaceholderText("Thread title")).toHaveValue("what did radar see?");
    const bodyBox = screen.getByPlaceholderText("Say your piece. Keep it sourced.") as HTMLTextAreaElement;
    expect(bodyBox.value).toContain("Radar tracked it [1] and pilots saw it [2].");
    expect(bodyBox.value).toContain("[1] https://realufo.org/doc/DOE-UAP-D004");
    expect(screen.getByText("REFERENCING FILE")).toBeInTheDocument();
  });

  it("tells the asker questions are logged and become public pages only when shared", async () => {
    renderAppAt("/ask");
    expect(await screen.findByText(/Questions are logged\. Tap “share” on an answer to publish it as a public page/)).toBeInTheDocument();
  });

  it("shows nothing extra when both lists are empty", async () => {
    renderAppAt("/ask");
    await box();
    expect(screen.queryByText("YOUR QUESTIONS")).toBeNull();
    expect(screen.queryByText("SHARED QUESTIONS")).toBeNull();
  });

  it("a ?q= link opens with the question filled in and asked", async () => {
    renderAppAt("/ask?q=los%20alamos%201949");
    expect(await screen.findByDisplayValue("los alamos 1949")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenCalledWith("los alamos 1949");
  });

  it("an old /archive?ask= link redirects to /ask?q=", async () => {
    renderAppAt("/archive?ask=los%20alamos%201949");
    expect(await screen.findByDisplayValue("los alamos 1949")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/ask the archive — e\.g\./)).toBeInTheDocument();
    expect(useAskMock).toHaveBeenCalledWith("los alamos 1949");
  });

  it("Ask tab and footer link show only while the feature is on", async () => {
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "More" }));
    expect(within(screen.getByRole("navigation", { name: "More" })).getByRole("link", { name: "Ask" }).getAttribute("href")).toMatch(/^\/ask/);
    expect(within(screen.getByRole("navigation", { name: "Site" })).getByRole("link", { name: "Ask" })).toHaveAttribute("href", "/ask");
  });

  it("feature off: no tab, no link, /ask rests, old ?ask= links fall back to keyword search", async () => {
    askFeature = false;
    const { unmount } = renderAppAt("/archive?ask=los%20alamos%201949");
    expect(await screen.findByPlaceholderText(/search .*records|search the archive/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(within(screen.getByRole("navigation", { name: "More" })).queryByRole("link", { name: "Ask" })).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "Site" })).queryByRole("link", { name: "Ask" })).toBeNull();
    unmount();
    renderAppAt("/ask");
    expect(await screen.findByText(/Ask is resting/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask the archive — e\.g\./)).toBeNull();
    expect(useAskMock).not.toHaveBeenCalled();
  });
});
