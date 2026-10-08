// /shelf — the reading-shelf funnel page: all 64 affiliate picks with the
// Associates tag, the FTC disclosure, the Ko-fi support card, and email signup.
import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderAppAt } from "./util";
import { ALL_PICKS } from "../../../worker/lib/affiliate";

describe("/shelf", () => {
  it("renders all 48 picks as tagged Amazon affiliate links", async () => {
    renderAppAt("/shelf");
    await screen.findByRole("heading", { level: 1, name: /reading shelf/i });
    const amzLinks = screen.getAllByRole("link", { name: /view on amazon/i });
    expect(amzLinks).toHaveLength(ALL_PICKS.length);
    for (const a of amzLinks) {
      expect(a.getAttribute("href")).toContain("tag=realufo-20");
      expect(a.getAttribute("rel")).toContain("sponsored");
    }
    // Spot-check: ASIN picks go straight to /dp/, the NULL-ASIN pick falls back to search.
    const hynek = amzLinks.find((a) => a.textContent?.includes("The UFO Experience"));
    expect(hynek?.getAttribute("href")).toContain("/dp/1590033086/");
    const blueBook = amzLinks.find((a) => a.textContent?.includes("Project Blue Book Declassified"));
    expect(blueBook?.getAttribute("href")).toContain("amazon.com/s?k=");
    // FTC disclosure is live because the tag is set.
    expect(screen.getByText(/as an amazon associate, realufo earns/i)).toBeInTheDocument();
  });

  it("has the Ko-fi support card and the email list signup", async () => {
    renderAppAt("/shelf");
    await screen.findByRole("heading", { level: 1, name: /reading shelf/i });
    const kofi = screen.getByRole("link", { name: /buy us a coffee on ko-fi/i });
    expect(kofi.getAttribute("href")).toBe("https://ko-fi.com/realufo");
    expect(screen.getByLabelText(/email for alerts/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to the archive/i }).getAttribute("href")).toBe(
      "/archive",
    );
  });
});
