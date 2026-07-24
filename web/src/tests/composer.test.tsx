// Composer overlay tests (Task 16). The query mutation hooks
// (useAddComment/useReply/useCreateThread) are mocked entirely — their real
// cache-update behavior is already covered by tests/queries.test.tsx; these
// tests only assert that Composer calls the *right* mutation with the right
// vars, and that the toast/empty-body/429 wiring behaves per
// docs/superpowers/FRONTEND-CONTEXT.md ("write endpoints may return 429 ...
// surface as a toast").
//
// A tiny `Opener` component calls `useOverlay().openComposer(opts)` on mount
// so each test can drive the *real* OverlayProvider/OverlayHost (not a mock
// of the overlay context itself) — this exercises the actual open/close/toast
// wiring end-to-end, only the network-touching mutation hooks are stubbed.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { ApiError } from "../api/client";
import { OverlayProvider, OverlayHost, useOverlay, type ComposerOpts } from "../overlays/OverlayProvider";

const mockAddCommentMutate = vi.fn();
const mockReplyMutate = vi.fn();
const mockCreateThreadMutate = vi.fn();
// Mutable per-test pending flag for useCreateThread's `isPending` — toggled by
// the in-flight-guard test below (same pattern as components.test.tsx's
// `mockBootstrapArchives`).
let mockCreateThreadPending = false;

vi.mock("../api/queries", () => ({
  useAddComment: () => ({ mutate: mockAddCommentMutate, isPending: false }),
  useReply: () => ({ mutate: mockReplyMutate, isPending: false }),
  useCreateThread: () => ({ mutate: mockCreateThreadMutate, isPending: mockCreateThreadPending }),
}));

function Opener({ opts }: { opts: ComposerOpts }) {
  const { openComposer } = useOverlay();
  useEffect(() => {
    openComposer(opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderComposer(opts: ComposerOpts) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <Opener opts={opts} />
        <OverlayHost />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAddCommentMutate.mockReset();
  mockReplyMutate.mockReset();
  mockCreateThreadMutate.mockReset();
  mockCreateThreadPending = false;
});

describe("Composer", () => {
  it("shows the referencing-file chip and thread-title input for newThread mode with a refLabel", () => {
    renderComposer({ mode: "newThread", boardId: "uap", refLabel: "cia_report_1978.pdf" });

    expect(screen.getByText("REFERENCING FILE")).toBeInTheDocument();
    expect(screen.getByText("cia_report_1978.pdf")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Thread title")).toBeInTheDocument();
  });

  it("toasts 'Say something first' and does not submit when the body is empty", () => {
    renderComposer({ mode: "newThread", boardId: "uap" });

    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    expect(screen.getByText(/Say something first/)).toBeInTheDocument();
    expect(mockCreateThreadMutate).not.toHaveBeenCalled();
  });

  it("submits a filled newThread composer with source_record_id and op_body", () => {
    renderComposer({
      mode: "newThread",
      boardId: "uap",
      sourceRecordId: "rec42",
      refLabel: "cia_report_1978.pdf",
    });

    fireEvent.change(screen.getByPlaceholderText("Thread title"), {
      target: { value: "Something strange over the coast" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), {
      target: { value: "Saw three lights moving in formation." },
    });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    expect(mockCreateThreadMutate).toHaveBeenCalledTimes(1);
    const [vars] = mockCreateThreadMutate.mock.calls[0];
    expect(vars).toMatchObject({
      board: "uap",
      title: "Something strange over the coast",
      op_body: "Saw three lights moving in formation.",
      source_record_id: "rec42",
    });
  });

  it("toasts 'slow down — too many posts' when the mutation rejects with a 429 ApiError", () => {
    mockCreateThreadMutate.mockImplementation((_vars: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new ApiError(429, "rate limited"));
    });

    renderComposer({ mode: "newThread", boardId: "uap" });

    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), {
      target: { value: "Body text here" },
    });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));

    expect(screen.getByText(/slow down — too many posts/i)).toBeInTheDocument();
  });

  it("disables POST and ignores clicks while a mutation is already in flight (no duplicate submit on double-tap)", () => {
    mockCreateThreadPending = true;
    renderComposer({ mode: "newThread", boardId: "uap" });

    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), {
      target: { value: "Body text here" },
    });

    const postButton = screen.getByRole("button", { name: /post/i });
    expect(postButton).toBeDisabled();

    fireEvent.click(postButton);
    expect(mockCreateThreadMutate).not.toHaveBeenCalled();
  });
});
