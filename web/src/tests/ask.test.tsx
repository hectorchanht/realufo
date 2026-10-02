import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
  useHubs: () => ({ data: { hubs: [{ kind: "agency", slug: "fbi", label: "FBI", count: 104, values: ["FBI"] }] } }),
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

  it("share publicly sends this ask's log id and flips to undo; hidden without log id or sources", () => {
    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7 } });
    const { rerender } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "share publicly" }));
    expect(shareMutate).toHaveBeenCalledWith({ id: 7, public: true }, expect.anything());
    act(() => shareMutate.mock.calls[0][1].onSuccess({ public: true }));
    fireEvent.click(screen.getByRole("button", { name: "✓ shared · undo" }));
    expect(shareMutate).toHaveBeenLastCalledWith({ id: 7, public: false }, expect.anything());

    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: null } });
    rerender(<MemoryRouter><AskAnswer question="q?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /share publicly|undo/ })).toBeNull();

    useAskMock.mockReturnValue({ ...answered, data: { ...answered.data, log_id: 7, sources: [] } });
    rerender(<MemoryRouter><AskAnswer question="q2?" /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /share publicly|undo/ })).toBeNull();
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

describe("Archive ASK toggle", () => {
  beforeEach(() => {
    askFeature = true;
    useAskMock.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
    useAskRecentMock.mockReturnValue({ data: undefined });
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ask mode with no question shows your questions and recently asked; tapping one asks it", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Earlier question one"]));
    useAskRecentMock.mockReturnValue({
      data: { recent: [{ question: "What about Gimbal?", sources: 2, asked_at: "2026-10-02 08:00:00" }] },
    });
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    expect(screen.getByText("YOUR QUESTIONS")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier question one" })).toBeInTheDocument();
    expect(screen.getByText("RECENTLY ASKED")).toBeInTheDocument();
    expect(screen.getByText("2 sources")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /What about Gimbal\?/ }));
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("What about Gimbal?");
    expect(screen.queryByText("RECENTLY ASKED")).toBeNull(); // lists hide while an answer is open
    expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)[0]).toBe("What about Gimbal?");
  });

  it("submitting a question saves it to your questions", async () => {
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    const box = screen.getByPlaceholderText(/ask the archive — e\.g\./);
    fireEvent.change(box, { target: { value: "  what did radar see?  " } });
    fireEvent.submit(box.closest("form")!);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(ASK_HISTORY_KEY)!)).toEqual(["what did radar see?"]));
  });

  it("clear button empties your questions", async () => {
    localStorage.setItem(ASK_HISTORY_KEY, JSON.stringify(["Old one"]));
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    fireEvent.click(screen.getByRole("button", { name: "clear your questions" }));
    expect(screen.queryByRole("button", { name: "Old one" })).toBeNull();
    expect(localStorage.getItem(ASK_HISTORY_KEY)).toBeNull();
  });

  it("post to a board opens the new-thread composer pre-filled from the answer", async () => {
    useAskMock.mockReturnValue(answered);
    renderAppAt("/archive?ask=what%20did%20radar%20see%3F");
    fireEvent.click(await screen.findByRole("button", { name: "⤴ post to a board" }));
    expect(await screen.findByPlaceholderText("Thread title")).toHaveValue("what did radar see?");
    const bodyBox = screen.getByPlaceholderText("Say your piece. Keep it sourced.") as HTMLTextAreaElement;
    expect(bodyBox.value).toContain("Radar tracked it DOE-UAP-D004 and pilots saw it WARGOV-VID-1.");
    expect(bodyBox.value).toContain("Sources: DOE-UAP-D004, WARGOV-VID-1");
    expect(screen.getByText("REFERENCING FILE")).toBeInTheDocument();
  });

  it("ask mode tells the asker questions are logged and listed only when shared", async () => {
    renderAppAt("/archive");
    expect(screen.queryByText(/Questions are logged/)).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    expect(screen.getByText(/Questions are logged\. Tap “share publicly”/)).toBeInTheDocument();
  });

  it("shows nothing extra when both lists are empty", async () => {
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    expect(screen.queryByText("YOUR QUESTIONS")).toBeNull();
    expect(screen.queryByText("RECENTLY ASKED")).toBeNull();
  });

  it("is hidden when the ask feature is off", async () => {
    askFeature = false;
    renderAppAt("/archive");
    await screen.findByPlaceholderText(/search/i);
    expect(screen.queryByRole("button", { name: "Ask the archive" })).toBeNull();
    expect(screen.queryByText("AI-RAG soon")).toBeNull();
  });

  it("typing in ask mode sends nothing; Enter submits ?ask= and shows the card", async () => {
    useAskMock.mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    renderAppAt("/archive");
    fireEvent.click(await screen.findByRole("button", { name: "Ask the archive" }));
    const box = screen.getByPlaceholderText(/ask the archive — e\.g\./);
    fireEvent.change(box, { target: { value: "  what did radar see?  " } });
    expect(useAskMock).not.toHaveBeenCalledWith(expect.stringContaining("radar"));
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("what did radar see?");
  });

  it("a ?ask= link opens in ask mode with the question filled in", async () => {
    renderAppAt("/archive?ask=los%20alamos%201949");
    const toggle = await screen.findByRole("button", { name: "Ask the archive" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("los alamos 1949")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenCalledWith("los alamos 1949");
  });

  it("turning ask mode off clears the answer", async () => {
    useAskMock.mockReturnValue({
      data: { answer: "Discussed green fireballs [1].", cached: false,
              sources: [{ n: 1, record_id: "DOE-UAP-D004", title: "Los Alamos", page: 2, kind: "pdf", thumb: null }] },
      isLoading: false, error: null, refetch: vi.fn(),
    });
    renderAppAt("/archive?ask=los%20alamos%201949");
    expect(await screen.findByLabelText("archive answer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask the archive" }));
    expect(screen.getByRole("button", { name: "Ask the archive" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByLabelText("archive answer")).toBeNull();
  });

  it("a ?ask= link while the feature is off falls back to keyword search", async () => {
    askFeature = false;
    renderAppAt("/archive?ask=los%20alamos%201949");
    expect(await screen.findByPlaceholderText(/search .*records|search the archive/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask the archive — e\.g\./)).toBeNull();
    expect(useAskMock).not.toHaveBeenCalled();
  });
});
