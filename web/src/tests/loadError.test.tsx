import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ApiError } from "../api/client";
import { shouldRetry } from "../api/queryClient";
import { LoadError } from "../components/LoadError";
import { renderAppAt } from "./util";

describe("shouldRetry", () => {
  it("never retries 4xx; retries network errors twice", () => {
    expect(shouldRetry(0, new ApiError(404, "x"))).toBe(false);
    expect(shouldRetry(0, new Error("net"))).toBe(true);
    expect(shouldRetry(2, new Error("net"))).toBe(false);
  });
});

describe("LoadError", () => {
  it("shows the not-found copy (no retry) for a 404", () => {
    render(<LoadError error={new ApiError(404, "x")} onRetry={vi.fn()} notFound="file not found." />);
    expect(screen.getByText("file not found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "retry" })).toBeNull();
  });

  it("shows a retry button for a 500 and calls onRetry", () => {
    const fn = vi.fn();
    render(<LoadError error={new ApiError(500, "x")} onRetry={fn} notFound="file not found." />);
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("404 route", () => {
  it("renders the not-found screen inside the shell", async () => {
    renderAppAt("/definitely-not-a-page");
    expect(await screen.findByText(/signal lost/)).toBeInTheDocument();
    expect(document.querySelector("[data-bottomtab], [data-topnav]")).not.toBeNull();
  });
});
