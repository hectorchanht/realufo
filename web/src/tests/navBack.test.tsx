import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { parentPath } from "../components/navItems";
import { renderAppAt } from "./util";

describe("parentPath", () => {
  it("maps detail pages to their logical parent", () => {
    expect(parentPath("/doc/X")).toBe("/archive");
    expect(parentPath("/thread/t1")).toBe("/boards");
    expect(parentPath("/board/uap")).toBe("/boards");
    expect(parentPath("/case/roswell")).toBe("/map");
    expect(parentPath("/release/6")).toBe("/browse");
    expect(parentPath("/browse")).toBe("/archive");
    expect(parentPath("/whatever")).toBe("/");
  });
});

describe("back on a deep-linked page", () => {
  it("goes to the parent page when there is no earlier in-app page", async () => {
    renderAppAt("/board/uap");
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(document.querySelector("[data-screen='boards']")).toBeInTheDocument(),
    );
  });
});
