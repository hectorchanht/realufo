import { describe, expect, it } from "vitest";
import { parseKeyMoments } from "../lib/keyMoments";

// Shapes seen across the 117 war.gov video summaries that carry a
// time-coded "Video Description" (Oct 2026).
const SUMMARY = `The United States Central Command submitted a report … in 2024.

Video Description:
00:00-00:04: The sensor pans to track an area of contrast.
01:43-2:05: A rectangular digital overlay, or “focus box,” appears.
00:29: The sensor stops tracking the area of contrast.
00:27-00:29 A black screen appears featuring the phrase “white edge threshold enhancement”.
00:01-00:011: An area of contrast is visible near the center of the screen.
3:23-4:29: The sensor zooms out.
1:02:03 – 1:02:10: Hour-long clip.

AARO Comment: This video footage significantly overlaps in content with DOW-UAP-PR122.

This video description is provided for informational purposes only.`;

describe("parseKeyMoments", () => {
  it("turns time-coded lines into sorted moments, tolerating every observed format", () => {
    const { moments } = parseKeyMoments(SUMMARY);
    expect(moments.map((m) => [m.start, m.end])).toEqual([
      [0, 4],
      [1, 11], // "00:011" typo → 11 s
      [27, 29],
      [29, null],
      [103, 125],
      [203, 269],
      [3723, 3730],
    ]);
    expect(moments[2].text).toBe("A black screen appears featuring the phrase “white edge threshold enhancement”.");
    expect(moments[4].text).toBe("A rectangular digital overlay, or “focus box,” appears.");
  });

  it("returns the prose without the moment lines or a bare header", () => {
    const { prose } = parseKeyMoments(SUMMARY);
    expect(prose).not.toMatch(/\d:\d\d/);
    expect(prose).not.toMatch(/^video description:/im);
    expect(prose).toBe(
      "The United States Central Command submitted a report … in 2024.\n\n" +
        "AARO Comment: This video footage significantly overlaps in content with DOW-UAP-PR122.\n\n" +
        "This video description is provided for informational purposes only.",
    );
  });

  it("keeps prose that follows the header label on the same line", () => {
    const { prose, moments } = parseKeyMoments("Intro.\n\nVideo description: This media was digitized from film.\n00:00-00:10: Clouds.");
    expect(moments).toHaveLength(1);
    expect(prose).toBe("Intro.\n\nThis media was digitized from film.");
  });

  it("leaves summaries without time codes untouched", () => {
    const s = "This archival footage is a digitization of a 16mm print.\n\nIt was filmed in 1952.";
    expect(parseKeyMoments(s)).toEqual({ prose: s, moments: [] });
    expect(parseKeyMoments(null)).toEqual({ prose: "", moments: [] });
  });
});
