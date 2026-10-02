import type { Platform } from "./common";

// Per-platform copy from the X text (Spec 5 §3.2). Pure; no I/O.

const URL_RE = /https?:\/\/\S+/g;
const SITE_TAGS = "#UFO #UAP #Pentagon #declassified";
const ARCHIVE_TAG: Record<string, string> = { wargov: "#DeptOfWar", aaro: "#AARO", nara: "#NationalArchives", nasa: "#NASA" };

export type Facet = { index: { byteStart: number; byteEnd: number }; features: { $type: string; uri: string }[] };

export const linkOf = (text: string): string | null => text.match(URL_RE)?.[0] ?? null;
export const stripUrls = (text: string) => text.replace(URL_RE, "").replace(/[ \t]+$/gm, "").trim();

const seg = (s: string) => [...new Intl.Segmenter().segment(s)].map((x) => x.segment);
export const graphemes = (s: string) => seg(s).length;

// Trim to `max` (measured by `count`), ending with "…". ponytail: O(n²) pop loop, inputs are ≤ a few KB.
export function clip(s: string, max: number, count: (t: string) => number = (t) => t.length): string {
  if (count(s) <= max) return s;
  const parts = seg(s);
  while (parts.length && count(parts.join("").trimEnd() + "…") > max) parts.pop();
  return parts.join("").trimEnd() + "…";
}

export const tagsFor = (archive: string | null) => [SITE_TAGS, ARCHIVE_TAG[archive ?? ""]].filter(Boolean).join(" ");

// "clip:clips/wargov/V1.mp4" | "thumb:images/aaro/x.png" → "wargov" | "aaro"
export const archiveOf = (media: string | null) => media?.slice(media.indexOf(":") + 1).split("/")[1] ?? null;

// YouTube title: first line, cut at a sentence end or word (never "…" mid-word), + " #Shorts".
// YouTube rejects empty titles and "<" ">".
const SHORTS = " #Shorts";
export function ytTitle(base: string): string {
  const line = (base.split("\n")[0].trim() || base.trim()).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  const max = 100 - SHORTS.length;
  if (!line) return "Declassified UAP file" + SHORTS;
  if (line.length <= max) return line + SHORTS;
  const head = line.slice(0, max + 1); // +1: a space right after the limit still counts as a word end
  const sentence = head.slice(0, max).match(/^.*[.!?](?=\s)/)?.[0];
  const sp = head.lastIndexOf(" ");
  const cut = sentence && sentence.length >= 30 ? sentence : sp > 0 ? head.slice(0, sp).replace(/[\s,;:–-]+$/, "") : clip(line, max);
  return cut + SHORTS;
}

export function compose(p: Platform, xText: string, archive: string | null): { text: string; title: string; link: string | null } {
  const link = linkOf(xText);
  const base = stripUrls(xText);
  const tags = tagsFor(archive);
  const title = clip(base.split("\n")[0].trim() || base, 100);
  const tail = (t: string) => (link ? `${t}\n\n${link}` : t);
  const room = (max: number, suffix: string, count?: (t: string) => number) => clip(base, max - (count ?? ((t: string) => t.length))(suffix), count) + suffix;
  switch (p) {
    case "fb":
      return { text: tail(base), title, link };
    case "threads":
      return { text: room(500, link ? `\n\n${link}` : ""), title, link };
    case "bsky":
      return { text: room(300, link ? `\n\n${link}` : "", graphemes), title, link };
    case "ig":
      return { text: room(2200, `${link ? "\n\n🔗 link in bio" : ""}\n\n${tags}`), title, link };
    case "yt":
      return { text: room(5000, `${link ? `\n\n${link}` : ""}\n\n${tags}`), title: ytTitle(base), link };
    case "tiktok":
      return { text: room(2200, `\n\n${tags}`), title, link };
  }
}

export function bskyFacets(text: string): Facet[] {
  const enc = new TextEncoder();
  return [...text.matchAll(URL_RE)].map((m) => {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    return { index: { byteStart, byteEnd: byteStart + enc.encode(m[0]).length }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] };
  });
}
