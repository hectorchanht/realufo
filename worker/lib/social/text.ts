import type { Platform } from "./common";
import { docTitle } from "../ssr";

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

// The archive record behind a "pick" post (null for release/highlight posts).
export type PostRecord = { id: string; kind: string; title: string | null; location: string | null };

// "Yellow Sea" → "#YellowSea", "U.S. Navy" → "#USNavy"; first place only, dropped if odd.
const camelTag = (s: string) => s.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9]/g, "")).map((w) => w && w[0].toUpperCase() + w.slice(1)).join("");
export function placeTag(location: string | null): string | null {
  const t = camelTag((location ?? "").split(/[;,|/]/)[0].trim());
  return /^[A-Za-z]/.test(t) && t.length >= 3 && t.length <= 24 && !/^(NA|Various|Unknown)$/i.test(t) ? `#${t}` : null;
}
export const idTag = (id: string) => `#${id.replace(/[^A-Za-z0-9]/g, "")}`;

export const tagsFor = (archive: string | null, rec?: PostRecord | null) =>
  [SITE_TAGS, ARCHIVE_TAG[archive ?? ""], rec && placeTag(rec.location), rec && idTag(rec.id)].filter(Boolean).join(" ");

// Search-friendly first line: the official file title with its id, e.g.
// "DOW-UAP-PR104 — Unresolved UAP Report, Yellow Sea, 2025 · declassified UAP video".
export const headlineFor = (rec: PostRecord) => `${docTitle(rec.title ?? "", rec.id, rec.kind)} · declassified UAP ${rec.kind === "video" ? "video" : "file"}`;

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

// Every platform: headline (title + id) for search, the X line for voice, link, hashtags.
export function compose(p: Platform, xText: string, archive: string | null, rec?: PostRecord | null): { text: string; title: string; link: string | null } {
  const link = linkOf(xText);
  const line = stripUrls(xText);
  const head = rec ? headlineFor(rec) : null;
  const body = head ? `${head}\n\n${line}` : line;
  const tags = tagsFor(archive, rec);
  const title = clip((head ?? line).split("\n")[0].trim() || line, 100);
  const linkPart = link ? `\n\n${link}` : "";
  // body is trimmed to fit; the link and tags never are
  const room = (max: number, suffix: string, count: (t: string) => number = (t) => t.length) => clip(body, max - count(suffix), count) + suffix;
  switch (p) {
    case "fb":
      return { text: `${body}${linkPart}\n\n${tags}`, title, link };
    case "threads":
      return { text: room(500, `${linkPart}\n\n${tags}`), title, link };
    case "bsky": // 300 graphemes: keep the tag line short
      return { text: room(300, `${linkPart}\n\n${["#UFO #UAP", rec && idTag(rec.id)].filter(Boolean).join(" ")}`, graphemes), title, link };
    case "ig":
      return { text: room(2200, `${link ? "\n\n🔗 link in bio" : ""}\n\n${tags}`), title, link };
    case "yt":
      return { text: room(5000, `${linkPart}\n\n${tags}`), title: ytTitle(head ?? line), link };
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
