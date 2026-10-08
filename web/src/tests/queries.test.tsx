import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { useVote, useAddComment, useAddCaseComment, qk } from "../api/queries";
import { api, QueuedError } from "../api/client";

// The client itself is covered by client.test.ts — here we mock it entirely so these
// tests exercise only the cache-update logic (optimistic flip / prepend), not fetch.
vi.mock("../api/client", async (orig) => ({
  ...(await orig<typeof import("../api/client")>()),
  api: { get: vi.fn(), post: vi.fn() },
}));

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useVote", () => {
  it("optimistically bumps votes before the request resolves, then reconciles with the server value", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.thread("th1"), {
      thread: { id: "th1", votes: 5 },
      sourceRecord: null,
      posts: [],
    });

    let resolvePost!: (v: { voted: boolean; votes: number }) => void;
    const pending = new Promise<{ voted: boolean; votes: number }>((resolve) => {
      resolvePost = resolve;
    });
    vi.mocked(api.post).mockReturnValue(pending as ReturnType<typeof api.post>);

    const { result } = renderHook(() => useVote(), { wrapper: makeWrapper(qc) });

    act(() => {
      result.current.mutate({ target_type: "thread", target_id: "th1" });
    });

    // optimistic: cache already reflects +1 before the mocked fetch has resolved
    await waitFor(() => {
      const data = qc.getQueryData<{ thread: { votes: number } }>(qk.thread("th1"));
      expect(data?.thread.votes).toBe(6);
    });

    resolvePost({ voted: true, votes: 9 });

    // reconciled: onSuccess overwrites with the server's authoritative count
    await waitFor(() => {
      const data = qc.getQueryData<{ thread: { votes: number } }>(qk.thread("th1"));
      expect(data?.thread.votes).toBe(9);
    });
  });

  it("rolls back the optimistic bump on error", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.thread("th2"), { thread: { id: "th2", votes: 3 }, sourceRecord: null, posts: [] });
    vi.mocked(api.post).mockRejectedValue(new Error("POST /api/votes → 500"));

    const { result } = renderHook(() => useVote(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ target_type: "thread", target_id: "th2" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<{ thread: { votes: number } }>(qk.thread("th2"));
    expect(data?.thread.votes).toBe(3);
  });

  it("keeps the optimistic bump when the vote was queued offline (applied on flush)", async () => {
    localStorage.removeItem("ufo_voted");
    const qc = new QueryClient();
    qc.setQueryData(qk.thread("th3"), { thread: { id: "th3", votes: 3 }, sourceRecord: null, posts: [] });
    vi.mocked(api.post).mockRejectedValue(new QueuedError());

    const { result } = renderHook(() => useVote(), { wrapper: makeWrapper(qc) });
    act(() => {
      result.current.mutate({ target_type: "thread", target_id: "th3" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const data = qc.getQueryData<{ thread: { votes: number } }>(qk.thread("th3"));
    expect(data?.thread.votes).toBe(4);
    expect(JSON.parse(localStorage.getItem("ufo_voted") ?? "{}")["thread:th3"]).toBe(true);
  });
});

describe("useAddComment", () => {
  it("prepends the returned comment into the comments cache", async () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.comments("rec1"), { comments: [{ id: "c0", no: 1 }] });
    vi.mocked(api.post).mockResolvedValue({
      comment: {
        id: "c1",
        no: 2,
        body: "hi",
        handle: null,
        stance: null,
        votes: 0,
        created_at: "now",
        ago: "now",
        handleShow: null,
      },
    });

    const { result } = renderHook(() => useAddComment("rec1"), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ body: "hi" });
    });

    const data = qc.getQueryData<{ comments: Array<{ id: string }> }>(qk.comments("rec1"));
    expect(data?.comments.map((c) => c.id)).toEqual(["c1", "c0"]);
  });
});

describe("comment image uploads", () => {
  for (const [name, hook, path] of [
    ["useAddComment", () => useAddComment("rec1"), "/api/records/rec1/comments"],
    ["useAddCaseComment", () => useAddCaseComment("roswell"), "/api/cases/roswell/comments"],
  ] as const) {
    it(`${name} sends multipart FormData when images are attached`, async () => {
      vi.mocked(api.post).mockClear().mockResolvedValue({ comment: { id: "c9" } });
      const qc = new QueryClient();
      const { result } = renderHook(hook, { wrapper: makeWrapper(qc) });
      const images = [new File([new Uint8Array([1])], "pic.png", { type: "image/png" })];
      await act(async () => {
        await result.current.mutateAsync({ body: "look", stance: "analyst", images });
      });
      const [calledPath, sent] = vi.mocked(api.post).mock.calls[0];
      expect(calledPath).toBe(path);
      expect(sent).toBeInstanceOf(FormData);
      expect((sent as FormData).get("body")).toBe("look");
      expect((sent as FormData).get("image")).toBeInstanceOf(File);
    });

    it(`${name} sends JSON (not FormData) when no images are attached`, async () => {
      vi.mocked(api.post).mockClear().mockResolvedValue({ comment: { id: "c9" } });
      const qc = new QueryClient();
      const { result } = renderHook(hook, { wrapper: makeWrapper(qc) });
      await act(async () => {
        await result.current.mutateAsync({ body: "plain", stance: "analyst" });
      });
      const [, sent] = vi.mocked(api.post).mock.calls[0];
      expect(sent).not.toBeInstanceOf(FormData);
      expect(sent).toMatchObject({ body: "plain" });
    });
  }
});

