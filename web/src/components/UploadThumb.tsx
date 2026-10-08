// Thumbnail for a user-uploaded comment image; tap opens the full image in
// the MediaViewer. (Thread posts keep their own multi-kind image button.)
import { useOverlay } from "../overlays/OverlayProvider";

export function UploadThumb({ url, className = "" }: { url: string; className?: string }) {
  const { openViewer } = useOverlay();
  return (
    <button
      type="button"
      onClick={() => openViewer({ kind: "image", url, label: "attached image" })}
      aria-label="open attached image"
      className={`mt-[9px] block h-24 w-24 overflow-hidden rounded-[10px] border border-line2 bg-bg2 active:scale-[.96] ${className}`}
    >
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  );
}

// Every attached image of a comment, in attach order (first == image_url).
export function UploadThumbs({ urls, fallback }: { urls?: string[]; fallback?: string | null }) {
  const all = urls?.length ? urls : fallback ? [fallback] : [];
  if (!all.length) return null;
  return (
    <div className="mt-[9px] flex flex-wrap gap-2">
      {all.map((u) => (
        <UploadThumb key={u} url={u} className="mt-0" />
      ))}
    </div>
  );
}
