// CiteButton: the modal must be portaled to <body>, not rendered inside the
// screen. Doc/Case screens run a filling `fadeup` enter animation, which makes
// the screen div a containing block for position:fixed descendants — an
// inline modal then sizes to the whole article height and its card lands
// below the viewport, leaving only the dim visible (2026-10-07 report).
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverlayProvider } from "../overlays/OverlayProvider";
import CiteButton from "../components/CiteButton";

const rec = { id: "DOW-UAP-PR143", agency_full: "Department of War", title: "Unresolved UAP Report, Yellow Sea, 2023", doc_date: "2023" };

function setup() {
  // Mimic Doc.tsx: the screen root carries the filling fadeup animation.
  const { container } = render(
    <OverlayProvider>
      <div data-screen="doc" style={{ animation: "fadeup .28s ease both" }}>
        <CiteButton record={rec} />
      </div>
    </OverlayProvider>,
  );
  return container;
}

function openModal() {
  fireEvent.click(screen.getByRole("button", { name: "Cite this record" }));
  return screen.getByRole("dialog", { name: "Cite this record" });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("CiteButton modal", () => {
  it("portals the dialog to <body>, outside the animated screen div", () => {
    const container = setup();
    const dialog = openModal();
    expect(document.body.contains(dialog)).toBe(true);
    // The regression: the dialog must NOT be a descendant of the screen div,
    // otherwise fixed inset-0 measures the article height, not the viewport.
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
  });

  it("shows the citation with format tabs and a copy button", () => {
    setup();
    const dialog = openModal();
    expect(dialog).toHaveTextContent("Department of War");
    expect(dialog).toHaveTextContent("/doc/DOW-UAP-PR143");
    fireEvent.click(screen.getByRole("tab", { name: "BibTeX" }));
    expect(dialog).toHaveTextContent("@misc{realufo:DOWUAPPR143,");
    expect(screen.getByRole("button", { name: "Copy BibTeX" })).toBeTruthy();
  });

  it("closes on backdrop tap and on Escape", () => {
    setup();
    let dialog = openModal();
    fireEvent.click(dialog); // backdrop (outer div) click
    expect(screen.queryByRole("dialog", { name: "Cite this record" })).toBeNull();

    dialog = openModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Cite this record" })).toBeNull();

    openModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Cite this record" })).toBeNull();
  });

  it("renders nothing without a record", () => {
    render(
      <OverlayProvider>
        <CiteButton record={undefined} />
      </OverlayProvider>,
    );
    expect(screen.queryByRole("button", { name: "Cite this record" })).toBeNull();
  });
});
