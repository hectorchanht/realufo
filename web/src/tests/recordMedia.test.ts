import { describe, expect, it } from "vitest";
import { recordMedia } from "../lib/recordMedia";
import type { RecordDetail } from "../api/types";

const detail = (kind: string, crop: string | null) =>
  ({
    record: { kind },
    assets: [{ role: "full", cdn_url: "https://x/f", mime: `${kind}/x`, width: null, height: null, crop }],
  }) as unknown as RecordDetail;

describe("recordMedia crop", () => {
  it("parses a video's black-bar crop; none when unprobed, empty or not a video", () => {
    expect(recordMedia(detail("video", "616:1080:652:0"), true).crop).toEqual({ w: 616, h: 1080, x: 652, y: 0 });
    expect(recordMedia(detail("video", ""), true).crop).toBeNull();
    expect(recordMedia(detail("video", null), true).crop).toBeNull();
    expect(recordMedia(detail("image", "616:1080:652:0"), true).crop).toBeNull();
  });
});
