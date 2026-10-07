import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiscussionStarter, STARTER_MAX_COMMENTS } from "../components/DiscussionStarter";

let mockData: { question: string | null } | undefined = { question: "Does this memo contradict the official story?" };
vi.mock("../api/queries", () => ({
  useDiscussionStarter: () => ({ data: mockData, isLoading: false }),
}));

const onReply = vi.fn();
const renderStarter = (commentCount: number, recordId = "rec1") =>
  render(<DiscussionStarter recordId={recordId} commentCount={commentCount} onReply={onReply} />);

beforeEach(() => {
  mockData = { question: "Does this memo contradict the official story?" };
  onReply.mockReset();
  localStorage.clear();
});

describe("DiscussionStarter", () => {
  it("renders the AI-labeled question on a quiet record", () => {
    renderStarter(0);
    expect(screen.getByText("AI discussion starter")).toBeTruthy();
    expect(screen.getByText("Does this memo contradict the official story?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply" })).toBeTruthy();
  });

  it("hides once discussion is alive", () => {
    const { container } = renderStarter(STARTER_MAX_COMMENTS);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the server has no question", () => {
    mockData = { question: null };
    const { container } = renderStarter(0);
    expect(container).toBeEmptyDOMElement();
  });

  it("dismiss hides the card and persists per record", () => {
    const { container, unmount } = renderStarter(0, "rec-dismiss");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem("realufo.starter.dismissed.rec-dismiss")).toBe("1");
    // stays dismissed on remount
    unmount();
    const rerender = renderStarter(0, "rec-dismiss");
    expect(rerender.container).toBeEmptyDOMElement();
  });

  it("Reply focuses the quick-reply bar via onReply", () => {
    renderStarter(1);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});
