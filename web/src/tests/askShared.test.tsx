import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter, Link, Route, Routes } from "react-router-dom";
import { ApiError } from "../api/client";
import { AskShared } from "../screens/AskShared";
import { renderAppAt } from "./util";

const useSharedAskMock = vi.fn();
const useAskMock = vi.fn();
const shareMutate = vi.fn();
let askFeature = true;
vi.mock("../api/queries", () => ({
  useSharedAsk: (id: number | null) => useSharedAskMock(id),
  useAsk: (q: string) => useAskMock(q),
  useAskRecent: () => ({ data: undefined }),
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
  useHubs: () => ({ data: { hubs: [] } }),
}));
const shareLinkMock = vi.fn();
vi.mock("../lib/shareLink", async (orig) => ({
  ...(await orig<typeof import("../lib/shareLink")>()),
  shareLink: (t: string, u: string) => shareLinkMock(t, u),
}));

const shared = {
  id: 12,
  question: "What about Gimbal?",
  answer: "It rotated [1].",
  sources: [{ n: 1, record_id: "WARGOV-VID-1", title: "Gimbal", page: 0, kind: "video", thumb: null }],
  asked_at: "2026-10-02 08:00:00",
  url: "/ask/12-what-about-gimbal",
};

beforeEach(() => {
  askFeature = true;
  useSharedAskMock.mockReset().mockReturnValue({ data: shared, isLoading: false, error: null, refetch: vi.fn() });
  useAskMock.mockReset().mockReturnValue({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
  shareLinkMock.mockReset().mockResolvedValue("copied");
  shareMutate.mockReset();
});

describe("shared answer page", () => {
  it("shows the frozen answer and its sources for the id in the URL", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText(/It rotated/)).toBeInTheDocument(); // answer text is split around the [1] button
    expect(screen.getByText("What about Gimbal?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gimbal/ })).toHaveAttribute("href", "/doc/WARGOV-VID-1");
    expect(useSharedAskMock).toHaveBeenCalledWith(12);
    expect(document.title).toBe("What about Gimbal? · RealUFO");
  });

  it("share opens the share sheet for the page URL without publishing again", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    fireEvent.click(await screen.findByRole("button", { name: "share" }));
    await act(async () => {});
    expect(shareLinkMock).toHaveBeenCalledWith("What about Gimbal?", "/ask/12-what-about-gimbal");
    expect(shareMutate).not.toHaveBeenCalled();
    expect(screen.getByText("link copied")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "post on X" }).getAttribute("href")).toContain("x.com/intent/post");
  });

  it("an unshared or unknown answer says so", async () => {
    useSharedAskMock.mockReturnValue({ data: undefined, isLoading: false, error: new ApiError(404, "not found"), refetch: vi.fn() });
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText("this answer isn't shared anymore.")).toBeInTheDocument();
  });

  it("a non-numeric id never fetches and says not shared", async () => {
    renderAppAt("/ask/nope");
    expect(await screen.findByText("this answer isn't shared anymore.")).toBeInTheDocument();
    expect(useSharedAskMock).toHaveBeenCalledWith(null);
  });

  it("asking your own question goes to /ask?q=", async () => {
    renderAppAt("/ask/12-what-about-gimbal");
    const box = await screen.findByPlaceholderText(/ask your own question/);
    fireEvent.change(box, { target: { value: "What about Nimitz?" } });
    fireEvent.submit(box.closest("form")!);
    expect(await screen.findByText("◉ consulting the archive…")).toBeInTheDocument();
    expect(useAskMock).toHaveBeenLastCalledWith("What about Nimitz?");
  });

  it("with Ask resting the answer still shows, the ask box doesn't", async () => {
    askFeature = false;
    renderAppAt("/ask/12-what-about-gimbal");
    expect(await screen.findByText(/It rotated/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/ask your own question/)).toBeNull();
  });

  it("moving to another answer clears the share note and the half-typed question", async () => {
    useSharedAskMock.mockImplementation((id: number | null) => ({
      data: { ...shared, id, question: `Question ${id}?`, url: `/ask/${id}-q` },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));
    render(
      <MemoryRouter initialEntries={["/ask/12-q"]}>
        <Link to="/ask/13-q">next</Link>
        <Routes>
          <Route path="/ask/:id" element={<AskShared />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "share" }));
    await act(async () => {});
    expect(screen.getByText("link copied")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/ask your own question/), { target: { value: "half typed" } });

    fireEvent.click(screen.getByRole("link", { name: "next" }));
    expect(await screen.findByText("Question 13?")).toBeInTheDocument();
    expect(screen.queryByText("link copied")).toBeNull();
    expect(screen.getByPlaceholderText(/ask your own question/)).toHaveValue("");
  });
});
