// Regression test for the "blank page on composer open" production crash.
//
// Root cause: <OverlayHost/> (which renders <Composer/>) was mounted as a
// SIBLING of <RouterProvider/> in App.tsx, but Composer calls useNavigate()
// (to jump to a newly created /thread/:id). useNavigate() throws without a
// <Router> ancestor, so opening the composer crashed the whole React tree —
// a white screen. The per-task composer test masked this by mocking
// useNavigate; this test uses the REAL react-router navigation so the
// dependency is exercised for real.
//
// The fix mounts OverlayHost INSIDE the router tree (AppShell). This test
// mirrors that: OverlayHost lives inside <MemoryRouter/>, the Composer renders
// with a real useNavigate, and a new-thread submit actually navigates.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { OverlayProvider, OverlayHost, useOverlay } from "../overlays/OverlayProvider";

// Mock only the data mutations (no network); react-router navigation is REAL.
vi.mock("../api/queries", () => ({
  useAddComment: () => ({ mutate: vi.fn(), isPending: false }),
  useReply: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateThread: () => ({
    mutate: (_vars: unknown, opts?: { onSuccess?: (d: { thread: { id: string } }) => void }) =>
      opts?.onSuccess?.({ thread: { id: "ut_TEST" } }),
    isPending: false,
  }),
}));

function Opener() {
  const { openComposer } = useOverlay();
  return (
    <button type="button" onClick={() => openComposer({ mode: "newThread", boardId: "uap" })}>
      open composer
    </button>
  );
}

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="path">{pathname}</div>;
}

describe("overlay navigation — Composer must render inside the router", () => {
  it("opens the composer and navigates on new-thread submit without crashing", async () => {
    render(
      <OverlayProvider>
        <MemoryRouter initialEntries={["/boards"]}>
          <Opener />
          <LocationProbe />
          <OverlayHost />
        </MemoryRouter>
      </OverlayProvider>,
    );

    // Opening the composer renders <Composer/>, which calls useNavigate() for
    // real — this line throws (and the test fails) if OverlayHost/Composer is
    // ever placed outside a <Router> again.
    fireEvent.click(screen.getByText("open composer"));
    expect(screen.getByText("NEW THREAD")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Say your piece. Keep it sourced."), {
      target: { value: "a real theory worth its own thread" },
    });
    fireEvent.click(screen.getByText("POST →"));

    await waitFor(() => expect(screen.getByTestId("path").textContent).toBe("/thread/ut_TEST"));
  });
});
