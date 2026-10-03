import { describe, it, expect } from "vitest";
import { compose, linkOf, stripUrls, clip, graphemes, bskyFacets, archiveOf, tagsFor, ytTitle, placeTag, idTag } from "../lib/social/text";

const LINK = "https://realufo.org/doc/DOW-UAP-PR019";
const X = `📼 Gulf of Oman, 2023: the orb that wouldn't quit\n📍 Dept. of War · 30 s clip\n${LINK}`;

describe("social text", () => {
  it("linkOf / stripUrls", () => {
    expect(linkOf(X)).toBe(LINK);
    expect(linkOf("no link here")).toBeNull();
    expect(stripUrls(X)).toBe("📼 Gulf of Oman, 2023: the orb that wouldn't quit\n📍 Dept. of War · 30 s clip");
  });

  it("archiveOf reads the archive segment of an x_posts.media value", () => {
    expect(archiveOf("clip:clips/wargov/V1.mp4")).toBe("wargov");
    expect(archiveOf("thumb:images/aaro/x.png")).toBe("aaro");
    expect(archiveOf(null)).toBeNull();
    expect(tagsFor("aaro")).toBe("#UFO #UAP #Pentagon #declassified #AARO");
    expect(tagsFor(null)).toBe("#UFO #UAP #Pentagon #declassified");
  });

  it("fb / threads: text, link, then hashtags", () => {
    expect(compose("fb", X, "wargov").text).toBe(`${stripUrls(X)}\n\n${LINK}\n\n#UFO #UAP #Pentagon #declassified #DeptOfWar`);
    expect(compose("threads", X, "wargov").text).toContain(`\n\n${LINK}\n\n#UFO #UAP`);
  });

  it("pick posts lead with the file title + id and tag the place and id on every platform", () => {
    const rec = { id: "DOW-UAP-PR104", kind: "video", title: "DOW-UAP-PR104, Unresolved UAP Report, Yellow Sea, 2025", location: "Yellow Sea" };
    const head = "DOW-UAP-PR104 — Unresolved UAP Report, Yellow Sea, 2025 · declassified UAP video";
    for (const p of ["fb", "threads", "bsky", "ig", "yt", "tiktok"] as const) {
      const t = compose(p, X, "wargov", rec).text;
      expect(t.startsWith(head), p).toBe(true);
      expect(t, p).toContain("#DOWUAPPR104");
      if (p !== "bsky") expect(t, p).toContain("#YellowSea");
    }
    expect(compose("yt", X, "wargov", rec).title).toBe("DOW-UAP-PR104 — Unresolved UAP Report, Yellow Sea, 2025 · declassified UAP video #Shorts");
    expect(graphemes(compose("bsky", `${"🛸 word ".repeat(60)}\n${LINK}`, "wargov", rec).text)).toBeLessThanOrEqual(300);
    expect(placeTag("Northeastern U.S.; Afghanistan")).toBe("#NortheasternUS");
    expect(placeTag("N/A")).toBeNull();
    expect(idTag("AARO-22-F-0863")).toBe("#AARO22F0863");
  });

  it("ig drops the dead link for 'link in bio' + tags", () => {
    const t = compose("ig", X, "wargov").text;
    expect(t).not.toContain("https://");
    expect(t).toContain("🔗 link in bio");
    expect(t.endsWith("#UFO #UAP #Pentagon #declassified #DeptOfWar")).toBe(true);
  });

  it("ig without a link says nothing about a bio", () => {
    expect(compose("ig", "just text", null).text).toBe("just text\n\n#UFO #UAP #Pentagon #declassified");
  });

  it("yt: title is the first line + #Shorts (≤100), description keeps link + tags", () => {
    const c = compose("yt", X, "wargov");
    expect(c.title).toBe("📼 Gulf of Oman, 2023: the orb that wouldn't quit #Shorts");
    expect(c.text).toContain(LINK);
    expect(c.text.endsWith("#DeptOfWar")).toBe(true);
    expect(compose("yt", "a".repeat(150), null).title.length).toBeLessThanOrEqual(100);
  });

  it("ytTitle cuts a long line at a word (no …) and always keeps #Shorts", () => {
    const live = "not saying it's aliens but… a 2013 middle east video shows an eight-pointed star in infrared 🫠👀 the official verdict? unresolved. enhance. ENHANCE.";
    expect(ytTitle(live)).toBe("not saying it's aliens but… a 2013 middle east video shows an eight-pointed star in infrared #Shorts");
    expect(ytTitle("a".repeat(150)).endsWith(" #Shorts")).toBe(true);
    expect(ytTitle("a".repeat(150)).length).toBeLessThanOrEqual(100);
  });

  it("ytTitle prefers a sentence end, drops < >, never empty", () => {
    expect(ytTitle("Pentagon releases the Gulf orb tape. Here is what the pilots saw over the water that night in 2023 near Oman"))
      .toBe("Pentagon releases the Gulf orb tape. #Shorts");
    expect(ytTitle("orb <script> tape")).toBe("orb script tape #Shorts");
    expect(ytTitle("")).toBe("Declassified UAP file #Shorts");
  });

  it("tiktok: no link, tags appended, ≤2200", () => {
    const t = compose("tiktok", X, "nasa").text;
    expect(t).not.toContain("https://");
    expect(t.endsWith("#NASA")).toBe(true);
    expect(compose("tiktok", "b".repeat(5000), null).text.length).toBeLessThanOrEqual(2200);
  });

  it("bsky trims the body, never the link or tags", () => {
    const long = `${"🛸 word ".repeat(60)}\n${LINK}`;
    const t = compose("bsky", long, null).text;
    expect(graphemes(t)).toBeLessThanOrEqual(300);
    expect(t.endsWith(`…\n\n${LINK}\n\n#UFO #UAP`)).toBe(true);
  });

  it("threads trims to 500 keeping the link", () => {
    const t = compose("threads", `${"x".repeat(700)} ${LINK}`, null).text;
    expect(t.length).toBeLessThanOrEqual(500);
    expect(t.endsWith(`${LINK}\n\n#UFO #UAP #Pentagon #declassified`)).toBe(true);
  });

  it("bsky facet offsets are UTF-8 bytes with emoji before the link", () => {
    const t = `📼 orb\n\n${LINK}`;
    const [f] = bskyFacets(t);
    const bytes = new TextEncoder().encode(t);
    expect(new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd))).toBe(LINK);
    expect(f.features[0]).toEqual({ $type: "app.bsky.richtext.facet#link", uri: LINK });
    expect(bskyFacets("no links")).toEqual([]);
  });

  it("clip leaves short text alone and ends long text with …", () => {
    expect(clip("short", 10)).toBe("short");
    const c = clip("abcdefghijkl", 8);
    expect(c).toBe("abcdefg…");
    expect(c.length).toBe(8);
  });
});
