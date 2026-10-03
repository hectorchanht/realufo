// How a record's media renders inline — shared by the Doc screen's media panel
// and thread-post record embeds (components/RecordEmbed.tsx).
import type { RecordDetail } from "../api/types";

export type RecordMediaKind = "image" | "video" | "audio" | "pdf" | "thumb";

/** The picture inside a video's black pillar/letterbox bars, in video pixels. */
export type VideoCrop = { w: number; h: number; x: number; y: number };

export function recordMedia(detail: RecordDetail | undefined, isDesktop: boolean) {
  const assets = detail?.assets ?? [];
  const thumbUrl = assets.find((a) => a.role === "thumb")?.cdn_url ?? null;
  const fullAsset = assets.find((a) => a.role === "full") ?? assets.find((a) => a.role === "original");
  const fullUrl = fullAsset?.cdn_url ?? thumbUrl ?? "";
  const mime = fullAsset?.mime ?? "";
  const kind = detail?.record.kind;
  // The real file whenever the browser can show it; PDFs inline only on
  // desktop (an <iframe> renders blank on mobile browsers).
  const media: RecordMediaKind = !fullAsset?.cdn_url
    ? "thumb"
    : kind === "video" || mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : kind === "image" || mime.startsWith("image/")
          ? "image"
          : isDesktop
            ? "pdf"
            : "thumb";
  const [w, h, x, y] = (fullAsset?.crop ?? "").split(":").map(Number);
  const crop: VideoCrop | null = media === "video" && w > 0 && h > 0 ? { w, h, x, y } : null;
  return { media, fullUrl, thumbUrl, crop };
}

// Record ids as users type them in posts: NASA-UAP-D030, DOW-UAP-PR012,
// CIA-UAP-001. Uppercase-only so lowercase URL slugs (…/nasa-uap-d030-…)
// are not matched.
export const RECORD_ID_RE = /\b[A-Z]{2,5}-UAP-[A-Z]{0,3}\d+\b/g;

/** Seconds → "1:23.04" (m:ss.cc); `pad` gives "01:23.04". */
export function formatMoment(t: number, pad = false): string {
  const cs = Math.round(Math.max(0, t) * 100);
  const m = String(Math.floor(cs / 6000));
  const s = String(Math.floor(cs / 100) % 60).padStart(2, "0");
  const c = String(cs % 100).padStart(2, "0");
  return `${pad ? m.padStart(2, "0") : m}:${s}.${c}`;
}

/** "1:23.04" / "1:23" / "83.04" → seconds; null if it isn't a time. */
export function parseMoment(s: string | null | undefined): number | null {
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec((s ?? "").trim());
  if (!m) return null;
  const t = Number(m[1] ?? 0) * 60 + Number(m[2]);
  return Number.isFinite(t) ? Math.round(t * 100) / 100 : null; // 83.04, not 83.0399…
}

// A moment on a record as users write it in posts: DOW-UAP-PR133@1:23.04
export const MOMENT_SUFFIX = "@(\\d+:\\d{2}(?:\\.\\d{1,2})?)";

const CDN = "https://assets.realufo.org/";

/** The 400px WebP sibling ingest writes next to each card image (`x.jpg` -> `x-400.webp`);
 *  same rule as crawler/ingest/thumbs.py small_key(). Null when the URL isn't a CDN JPEG/PNG. */
export function smallThumb(url: string): string | null {
  return url.startsWith(CDN) && /\.(jpe?g|png)$/i.test(url) ? url.replace(/\.(jpe?g|png)$/i, "-400.webp") : null;
}
