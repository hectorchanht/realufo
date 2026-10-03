// Small bits both the Worker's crawler HTML and the SPA render, kept in one place.

// Each cold case has a long-form, sourced story on the static archive (all 12
// checked live 2026-10-03; the case list is fixed).
export const caseStoryUrl = (slug: string) => `https://release.realufo.org/stories/${encodeURIComponent(slug)}/`;

export const MAP_INTRO =
  "Each dot is a place a declassified file names, sized by how many files mention it. Open a place to see its files, or browse the places below.";

export const RELEASES_TITLE = "Pentagon UFO File Releases: Dates, Schedule & Next Release";
export const RELEASES_DESCRIPTION =
  "Every Pentagon UFO file release so far: dates, file counts, gaps between drops and when the next release is likely.";
