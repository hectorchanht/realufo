// A record id mentioned in post text (e.g. "NASA-UAP-D030"): the id becomes a
// link to /doc/:id and the record's media renders right after it — image
// (tap → MediaViewer), video/audio (native player; a video's controls stay
// hidden until the first tap or focus, so the clip reads as a picture), PDF (thumb → inline
// /api/file route). Same media rules as the Doc screen (lib/recordMedia).
// Ids that don't resolve to a record stay plain text.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useRecord } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import { useMediaQuery } from "../lib/useMediaQuery";
import { formatMoment, recordMedia } from "../lib/recordMedia";
import { docTitleParts } from "../lib/docTitle";
import { isStandalone, navigateInPlace } from "../lib/pwaNav";

export function RecordEmbed({ id, t, withMedia }: { id: string; t?: number; withMedia: boolean }) {
  const { data } = useRecord(id);
  const { openViewer } = useOverlay();
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [controls, setControls] = useState(false);
  if (!data?.record) return <>{id}</>;

  const { media, fullUrl, thumbUrl } = recordMedia(data, isDesktop);
  const label = docTitleParts(id, data.record.title, data.record.kind).title;
  const box = "my-2 block w-full max-w-[360px] overflow-hidden rounded-[10px] border border-line2 bg-black";
  const pdfHref = `/api/file/${id}`;
  // Installed PWA: open the PDF in the app window itself, not a _blank tab —
  // the system browser would take over and the app cold-starts at the
  // homepage on return (see lib/pwaNav.ts).
  const onPdfClick = (e: React.MouseEvent) => {
    if (isStandalone()) {
      e.preventDefault();
      navigateInPlace(pdfHref);
    }
  };

  return (
    <>
      <Link to={`/doc/${id}${t !== undefined ? `?t=${t}` : ""}`} data-record-link className="font-mono text-signal underline underline-offset-2">
        {id}
        {t !== undefined && `@${formatMoment(t)}`}
      </Link>
      {withMedia && (
        <span data-record-embed={id} className="block">
          {media === "image" && (
            <button type="button" onClick={() => openViewer({ kind: "image", url: fullUrl, label })} aria-label={`open ${id}`} className={box}>
              {/* 640px thumb inline (originals run to MBs); full file opens in the viewer */}
              <img src={thumbUrl ?? fullUrl} alt={label} loading="lazy" className="max-h-[260px] w-full object-contain" />
            </button>
          )}
          {media === "video" && (
            // #t= media fragment: the clip opens at the cited moment
            <video
              src={t !== undefined ? `${fullUrl}#t=${t}` : fullUrl}
              poster={thumbUrl ?? undefined}
              controls={controls}
              onClick={() => setControls(true)}
              onFocus={() => setControls(true)}
              tabIndex={controls ? undefined : 0}
              aria-label={label}
              playsInline
              preload="metadata"
              className={`${box} max-h-[260px]`}
            />
          )}
          {media === "audio" && <audio src={fullUrl} controls preload="metadata" className="my-2 block w-full max-w-[360px]" />}
          {(media === "pdf" || media === "thumb") && (
            <a href={pdfHref} target="_blank" rel="noopener noreferrer" onClick={onPdfClick} className={`${box} relative`}>
              {thumbUrl ? (
                <img src={thumbUrl} alt={label} loading="lazy" className="max-h-[200px] w-full object-cover" />
              ) : (
                <span className="block px-3 py-4 font-mono text-[11px] text-dim">PDF · {label}</span>
              )}
              <span className="absolute bottom-2 right-2 rounded-[7px] px-2 py-1 font-mono text-[10px] text-white" style={{ background: "rgba(0,0,0,.6)" }}>
                ⛶ open PDF
              </span>
            </a>
          )}
        </span>
      )}
    </>
  );
}
