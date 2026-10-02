// How a record's media renders inline — shared by the Doc screen's media panel
// and thread-post record embeds (components/RecordEmbed.tsx).
import type { RecordDetail } from "../api/types";

export type RecordMediaKind = "image" | "video" | "audio" | "pdf" | "thumb";

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
  return { media, fullUrl, thumbUrl };
}

// Record ids as users type them in posts: NASA-UAP-D030, DOW-UAP-PR012,
// CIA-UAP-001. Uppercase-only so lowercase URL slugs (…/nasa-uap-d030-…)
// are not matched.
export const RECORD_ID_RE = /\b[A-Z]{2,5}-UAP-[A-Z]{0,3}\d+\b/g;
