import { Link } from "react-router-dom";
import type { Article } from "../api/types";
import { formatMoment } from "../lib/recordMedia";
import { useOverlay } from "../overlays/OverlayProvider";

// Articles this record is evidence in (look-alike pairs etc., scripts/article.py):
// side-by-side image, then each piece of evidence with its best moment. The
// current file's moment seeks in place; the others open at that moment.
// Images open full-screen in the media viewer.
export function Articles({ articles, currentId, onSeek }: { articles: Article[]; currentId: string; onSeek: (t: number) => void }) {
  const { openViewer } = useOverlay();
  return (
    <>
      {articles.map((a) => (
        <section key={a.slug} aria-label={a.title} className="mb-4 overflow-hidden rounded-xl border border-line2 bg-surface">
          <div className="px-3.5 pt-3 font-mono text-[10px] font-bold tracking-[.6px] text-signal">STORY · {a.evidence.length} FILES</div>
          <h2 className="px-3.5 pb-2.5 pt-1 font-body text-[15px] font-semibold leading-snug text-ink">{a.title}</h2>
          {a.image_url && (
            <button type="button" aria-label="Expand image" className="block w-full" onClick={() => openViewer({ kind: "image", url: a.image_url!, label: a.title })}>
              <img src={a.image_url} alt={a.title} loading="lazy" className="block w-full" />
            </button>
          )}
          <ol className="divide-y divide-line">
            {a.evidence.map((e) => {
              const here = e.id === currentId;
              const body = (
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] text-dim">
                    {e.id}
                    {e.t != null && <span className="text-signal"> ▶ {formatMoment(e.t)}</span>}
                    {e.page != null && <span className="text-signal"> · p.{e.page}</span>}
                    {here && " · this file"}
                  </span>
                  <span className="block font-body text-[13px] leading-snug text-ink">{e.label}</span>
                </span>
              );
              const cls = "flex min-w-0 flex-1 items-center py-2.5 pr-3.5 text-left";
              return (
                <li key={e.id} className="flex items-center gap-3 pl-3.5">
                  {e.image_url && (
                    <button type="button" aria-label={`Expand image: ${e.label}`} className="flex-none" onClick={() => openViewer({ kind: "image", url: e.image_url!, label: e.label })}>
                      <img src={e.image_url} alt="" loading="lazy" className="h-12 w-12 rounded-md object-cover" />
                    </button>
                  )}
                  {here && e.t != null ? (
                    <button type="button" className={cls} onClick={() => onSeek(e.t!)}>{body}</button>
                  ) : (
                    <Link className={cls} to={`/doc/${encodeURIComponent(e.id)}${e.t != null ? `?t=${e.t}` : e.page != null ? `?p=${e.page}` : ""}`}>{body}</Link>
                  )}
                </li>
              );
            })}
          </ol>
          {a.thread_id && (
            <Link to={`/thread/${a.thread_id}`} className="block border-t border-line px-3.5 py-2.5 font-mono text-[11px] text-signal">
              Read the full story + evidence →
            </Link>
          )}
        </section>
      ))}
    </>
  );
}
