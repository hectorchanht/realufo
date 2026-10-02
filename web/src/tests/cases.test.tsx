// Cold cases index: one link card per bootstrap case, with its lede.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Cases from "../screens/Cases";

vi.mock("../api/queries", () => ({
  useBootstrap: () => ({
    isLoading: false,
    data: {
      cases: [
        { slug: "kaikoura", name: "Kaikoura Lights", accent: "#c8a2ff", coord: "42.4 S", lede: "Radar and film over New Zealand." },
        { slug: "roswell", name: "Roswell", accent: "#cbd5e1", coord: "33.4 N", lede: "A 1947 press release." },
      ],
    },
  }),
}));

describe("Cases", () => {
  it("lists each case as a link to /case/:slug with its lede", () => {
    render(
      <MemoryRouter>
        <Cases />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Kaikoura Lights/ })).toHaveAttribute("href", "/case/kaikoura");
    expect(screen.getByRole("link", { name: /Roswell/ })).toHaveAttribute("href", "/case/roswell");
    expect(screen.getByText("Radar and film over New Zealand.")).toBeInTheDocument();
  });
});
