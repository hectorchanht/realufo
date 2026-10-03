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
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { ApiError, QueuedError } from "../api/client";
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
  useAddCaseComment: () => ({ mutate: vi.fn(), isPending: false }),
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

// Re-openable: drafts are kept per composer target until the post goes through.
function OpenButton({ opts }: { opts: ComposerOpts }) {
  const { openComposer } = useOverlay();
  return <button onClick={() => openComposer(opts)}>open composer</button>;
}

function renderReopenable(opts: ComposerOpts) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OpenButton opts={opts} />
        <OverlayHost />
      </OverlayProvider>
    </MemoryRouter>,
  );
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

  it("shows a promoted comment's image and sends it as image_ref; ✕ drops it", () => {
    renderComposer({ mode: "newThread", boardId: "uap", presetBody: "orb", presetImageUrl: "https://cdn/x/abc.png" });
    expect(screen.getByAltText("attached image preview")).toHaveAttribute("src", "https://cdn/x/abc.png");
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockCreateThreadMutate.mock.calls[0][0]).toMatchObject({ image_ref: "abc.png" });

    mockCreateThreadMutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockCreateThreadMutate.mock.calls[0][0].image_ref).toBeUndefined();
  });

  it("sends a picked image file with the reply", () => {
    renderComposer({ mode: "reply", threadId: "t1" });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "timeline.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/attach image/i), { target: { files: [file] } });
    expect(screen.getByAltText("attached image preview")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "see pic" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockReplyMutate.mock.calls[0][0]).toMatchObject({ body: "see pic", image: file });
  });

  it("previews the picked image; ✕ removes it, frees the blob URL, and posts without it", () => {
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-1");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    renderComposer({ mode: "reply", threadId: "t1" });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "timeline.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/attach image/i), { target: { files: [file] } });
    expect(create).toHaveBeenCalledWith(file);
    expect(screen.getByAltText("attached image preview")).toHaveAttribute("src", "blob:preview-1");

    fireEvent.click(screen.getByRole("button", { name: /remove image/i }));
    expect(screen.queryByAltText("attached image preview")).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    expect(screen.getByLabelText(/attach image/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "no pic" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockReplyMutate.mock.calls[0][0].image).toBeUndefined();
    create.mockRestore();
    revoke.mockRestore();
  });

  it("comment mode offers attach image and sends it with the comment", () => {
    renderComposer({ mode: "comment", recordId: "rec1" });
    const file = new File([new Uint8Array([1])], "c.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/attach image/i), { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "pic read" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockAddCommentMutate.mock.calls[0][0]).toMatchObject({ body: "pic read", image: file });
  });

  it("frees the preview blob URL when the composer closes", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview-2");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    renderComposer({ mode: "reply", threadId: "t1" });
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/attach image/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(revoke).toHaveBeenCalledWith("blob:preview-2");
    vi.restoreAllMocks();
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

  it("keeps the draft when dismissed and restores it when the same composer reopens", () => {
    renderReopenable({ mode: "comment", recordId: "draft-1" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "half-written read" } });
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(screen.queryByPlaceholderText(/Say your piece/i)).toBeNull();

    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toHaveValue("half-written read");
  });

  it("a post queued offline closes the composer and drops the draft", () => {
    mockAddCommentMutate.mockImplementation((_v: unknown, o?: { onError?: (e: unknown) => void }) => o?.onError?.(new QueuedError()));
    renderReopenable({ mode: "comment", recordId: "draft-q" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "offline read" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(screen.queryByPlaceholderText(/Say your piece/i)).toBeNull();
    expect(screen.queryByText(/Could not post/i)).toBeNull();

    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toHaveValue("");
  });

  it("an image post offline says it needs a connection (and keeps the draft)", () => {
    mockAddCommentMutate.mockImplementation((_v: unknown, o?: { onError?: (e: unknown) => void }) =>
      o?.onError?.(new ApiError(0, "Image posts need a connection")),
    );
    renderReopenable({ mode: "comment", recordId: "draft-img" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "look at this" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(screen.getByText(/Image posts need a connection/)).toBeInTheDocument();
    expect(screen.queryByText(/Could not post/i)).toBeNull();
  });

  it("OverlayHost toasts outbox events", () => {
    renderReopenable({ mode: "comment", recordId: "draft-t" });
    act(() => {
      window.dispatchEvent(new CustomEvent("outbox", { detail: { sent: 2, failed: [] } }));
    });
    expect(screen.getByText(/2 offline posts sent/)).toBeInTheDocument();
  });

  it("a submitted post clears its draft", () => {
    mockAddCommentMutate.mockImplementation((_v: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.());
    renderReopenable({ mode: "comment", recordId: "draft-2" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "sent read" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    expect(mockAddCommentMutate).toHaveBeenCalled();

    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toHaveValue("");
  });

  it("a failed post keeps the draft", () => {
    mockAddCommentMutate.mockImplementation((_v: unknown, o?: { onError?: (e: unknown) => void }) => o?.onError?.(new Error("net")));
    renderReopenable({ mode: "comment", recordId: "draft-3" });
    fireEvent.click(screen.getByText("open composer"));
    fireEvent.change(screen.getByPlaceholderText(/Say your piece/i), { target: { value: "unsent read" } });
    fireEvent.click(screen.getByRole("button", { name: /post/i }));
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));

    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toHaveValue("unsent read");
  });

  it("can't be dismissed while a post is sending", () => {
    mockCreateThreadPending = true;
    renderComposer({ mode: "newThread", boardId: "uap" });
    fireEvent.click(screen.getByRole("button", { name: /close composer/i }));
    expect(screen.getByPlaceholderText(/Say your piece/i)).toBeInTheDocument();
  });
});
