// Full-bleed doc / video / placeholder viewer. Ported from
// realufo-handoff/RealUFO.dc.html lines 404-414 (`sc-if value="{{ viewer }}"`).
import { useRef } from "react";
import type { MouseEvent } from "react";
import { X } from "lucide-react";
import { useOverlay } from "./OverlayProvider";
import { ZoomLens } from "../components/ImageTools";
import { DEFAULT_VIEW, pointToUV } from "../lib/mediaView";
import { useMediaQuery } from "../lib/useMediaQuery";

export function MediaViewer() {
  const { viewer, closeViewer } = useOverlay();
  const imgRef = useRef<HTMLImageElement>(null);
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  if (!viewer) return null;

  // A click on the backdrop, or on the image's letterbox, closes the viewer.
  function closeOutside(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) return closeViewer();
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    const box = img.getBoundingClientRect();
    const p = pointToUV(
      { w: box.width, h: box.height },
      e.clientX - box.left,
      e.clientY - box.top,
      { w: img.naturalWidth, h: img.naturalHeight },
      DEFAULT_VIEW,
    );
    if (p.u < 0 || p.u > 1 || p.v < 0 || p.v > 1) closeViewer();
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex animate-[fadein_.2s_ease] flex-col"
      style={{ background: "rgba(0,0,0,.94)" }}
      data-media-viewer
    >
      <div className="flex flex-none items-center gap-[10px] px-4 py-[14px]">
        <span className="flex-1 truncate font-mono text-[11px] text-dim">{viewer.label}</span>
        <button
          type="button"
          onClick={closeViewer}
          aria-label="Close viewer"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-line2 text-white active:scale-[.94]"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3" onClick={closeOutside}>
        {viewer.kind === "video" && (
          <video src={viewer.url} controls playsInline className="max-h-full max-w-full rounded-[10px] bg-black" />
        )}

        {viewer.kind === "image" && (
          // fills the area object-contain, so the lens geometry matches the doc panel's
          <div className="relative h-full w-full select-none">
            <img
              ref={imgRef}
              src={viewer.url}
              alt={viewer.label}
              className="h-full w-full object-contain"
              style={{ filter: viewer.filter || undefined }}
            />
            {viewer.lensMag && viewer.url && (
              <ZoomLens
                src={viewer.url}
                imgRef={imgRef}
                filter={viewer.filter ?? ""}
                view={DEFAULT_VIEW}
                mag={viewer.lensMag}
                clickThrough={finePointer}
              />
            )}
          </div>
        )}

        {viewer.kind === "doc" && (
          <div className="flex h-full w-full flex-col gap-[10px]">
            <iframe
              title={viewer.label || "document"}
              src={viewer.url}
              className="w-full flex-1 rounded-[10px] border border-line2 bg-white"
            />
          </div>
        )}

        {viewer.kind === "placeholder" && (
          <div className="text-center text-dim">
            <div
              className="mx-auto mb-4 grid h-[120px] w-[120px] place-items-center rounded-[14px] text-[34px]"
              style={{
                background:
                  "repeating-linear-gradient(45deg,var(--surface),var(--surface) 12px,var(--bg2) 12px,var(--bg2) 24px)",
              }}
            >
              🖼
            </div>
            <div className="font-mono text-xs">{viewer.label}</div>
            <div className="mt-2 font-mono text-[10px] text-faint">user upload · anon</div>
          </div>
        )}
      </div>

      {viewer.kind === "doc" && (
        <div className="flex-none px-4 pb-4 text-center">
          <a href={viewer.url} target="_blank" rel="noopener" className="font-mono text-[11px] text-signal">
            ↗ open source on official server
          </a>
        </div>
      )}
    </div>
  );
}

export default MediaViewer;
