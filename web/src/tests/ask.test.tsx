import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../api/client";
import { AskAnswer } from "../components/AskAnswer";
import { renderAppAt } from "./util";

const useAskMock = vi.fn();
let askFeature = true;
vi.mock("../api/queries", () => ({
  useAsk: (q: string) => useAskMock(q),
  useFacets: () => ({ data: undefined }),
  useBootstrap: () => ({
    data: { archives: [], boards: [], stats: { records: 2 }, ticker: [], sightings: [], cases: [], features: { ask: askFeature } },
    isLoading: false,
  }),
  useRecords: () => ({ data: { count: 0, records: [] }, isLoading: false, isPlaceholderData: false }),
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

beforeEach(() => useAskMock.mockReset());

describe("AskAnswer", () => {
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

describe("Archive ASK toggle", () => {
  beforeEach(() => {
    askFeature = true;
    useAskMock.mockReturnValue({ data: undefined, isLoading: false, error: null, refetch: vi.fn() });
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
});
