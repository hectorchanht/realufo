// Thumbnail for a user-uploaded comment image; tap opens the full image in
// the MediaViewer. (Thread posts keep their own multi-kind image button.)
import { useOverlay } from "../overlays/OverlayProvider";

export function UploadThumb({ url }: { url: string }) {
  const { openViewer } = useOverlay();
  return (
    <button
      type="button"
      onClick={() => openViewer({ kind: "image", url, label: "attached image" })}
      aria-label="open attached image"
      className="mt-[9px] block h-24 w-24 overflow-hidden rounded-[10px] border border-line2 bg-bg2 active:scale-[.96]"
    >
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
    </button>
  );
}
