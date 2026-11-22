// THE LABEL LAW (static surfaces) — Hector's ruling, 2026-11-22: "Real UFO
// and RealUFO can both show." The public-facing name exists in exactly
// three intentional forms, each in its own place; this test pins the
// static ones so they can never drift silently:
//
//   1. "RealUFO"  — the brand LABEL: PWA manifest name/short_name,
//      apple-mobile-web-app-title, og:site_name, the static <title>.
//   2. "Real UFO" — the spaced headline form (homepage Worker meta —
//      pinned on the worker side, worker/tests/label.spec.ts).
//   3. "REALUFO"  — all-caps ONLY as wordmark styling (Press Start 2P):
//      the AppBar page-title default below is that wordmark, nothing else.
//
// Changing any string asserted here is a BRANDING DECISION, not a
// cleanup: a red test means stop and get a ruling, not "fix the test".
// URLs, domains, package names and handles (realufo.org, @realufo_org,
// ko-fi.com/realufo) are infrastructure, not labels, and are NOT pinned.
import { describe, it, expect } from "vitest";
import html from "../../index.html?raw";
import manifestRaw from "../../public/manifest.webmanifest?raw";
import { DEFAULT_PAGE_TITLE } from "../lib/pageTitle";

// Variants that must never appear as a displayed name in the static
// shell. ("Real UFO" spaced in the meta description is descriptive
// prose — allowed by the ruling and deliberately not flagged.)
const FORBIDDEN_VARIANTS = ["RealUfo", "realUFO", "REAL UFO"];

describe("label law: static shell + manifest carry exactly RealUFO", () => {
  it("manifest name / short_name are the RealUFO label forms", () => {
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.name).toBe("RealUFO — Declassified UAP Archive");
    expect(manifest.short_name).toBe("RealUFO");
  });

  it("index.html apple title, og:site_name and static <title> are RealUFO forms", () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="RealUFO" />');
    expect(html).toContain('<meta property="og:site_name" content="RealUFO" />');
    expect(html).toContain("<title>RealUFO — Declassified UAP Archive</title>");
  });

  it("no unruled name variant appears in index.html or the manifest", () => {
    for (const v of FORBIDDEN_VARIANTS) {
      expect(html).not.toContain(v);
      expect(manifestRaw).not.toContain(v);
    }
  });

  it("all-caps REALUFO exists only as the AppBar wordmark default", () => {
    expect(DEFAULT_PAGE_TITLE.title).toBe("REALUFO");
  });
});
