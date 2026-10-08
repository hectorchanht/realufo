// lib/resumeRoute tests: the installed PWA resumes the last visited page on
// cold start instead of resetting to the homepage (see lib/resumeRoute.ts).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { saveLastRoute, readLastRoute, restoreLastRoute } from "../lib/resumeRoute";

const KEY = "realufo:lastRoute";

beforeEach(() => {
  localStorage.clear();
});

describe("resumeRoute", () => {
  it("round-trips the last visited route", () => {
    saveLastRoute("/doc/abc?archive=nara");
    expect(readLastRoute()).toBe("/doc/abc?archive=nara");
  });

  it("visiting the homepage clears the saved route", () => {
    saveLastRoute("/doc/abc");
    saveLastRoute("/");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readLastRoute()).toBeNull();
  });

  it("ignores entries past the TTL", () => {
    saveLastRoute("/doc/abc");
    expect(readLastRoute(Date.now() + 16 * 60 * 1000)).toBeNull();
    expect(readLastRoute(Date.now() + 14 * 60 * 1000)).toBe("/doc/abc");
  });

  it("ignores malformed or off-origin entries", () => {
    localStorage.setItem(KEY, "not-json{");
    expect(readLastRoute()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({ path: "https://evil.example/x", ts: Date.now() }));
    expect(readLastRoute()).toBeNull();
  });

  it("restoreLastRoute rewrites a bare cold start at / to the saved page", () => {
    saveLastRoute("/doc/abc");
    const hist = { replaceState: vi.fn() };
    restoreLastRoute({ loc: { pathname: "/", search: "" }, hist, standalone: true });
    expect(hist.replaceState).toHaveBeenCalledWith(null, "", "/doc/abc");
  });

  it("restoreLastRoute leaves deep links, query strings and non-PWA launches alone", () => {
    saveLastRoute("/doc/abc");
    const hist = { replaceState: vi.fn() };
    restoreLastRoute({ loc: { pathname: "/doc/xyz", search: "" }, hist, standalone: true });
    restoreLastRoute({ loc: { pathname: "/", search: "?q=ufo" }, hist, standalone: true });
    restoreLastRoute({ loc: { pathname: "/", search: "" }, hist, standalone: false });
    expect(hist.replaceState).not.toHaveBeenCalled();
  });

  it("restoreLastRoute does nothing with no saved route", () => {
    const hist = { replaceState: vi.fn() };
    restoreLastRoute({ loc: { pathname: "/", search: "" }, hist, standalone: true });
    expect(hist.replaceState).not.toHaveBeenCalled();
  });
});
