import { Link } from "react-router-dom";
import type { Article } from "../api/types";
import { formatMoment } from "../lib/recordMedia";

// Articles this record is evidence in (look-alike pairs etc., scripts/article.py):
// side-by-side image, then each piece of evidence with its best moment. The
// current file's moment seeks in place; the others open at that moment.
export function Articles({ articles, currentId, onSeek }: { articles: Article[]; currentId: string; onSeek: (t: number) => void }) {
  return (
    <>
      {articles.map((a) => (
        <section key={a.slug} aria-label={a.title} className="mb-4 overflow-hidden rounded-xl border border-line2 bg-surface">
          <div className="px-3.5 pt-3 font-mono text-[10px] font-bold tracking-[.6px] text-signal">LOOK-ALIKE FILES</div>
          <h2 className="px-3.5 pb-2.5 pt-1 font-body text-[15px] font-semibold leading-snug text-ink">{a.title}</h2>
          {a.image_url && <img src={a.image_url} alt={a.title} loading="lazy" className="block w-full" />}
          <ol className="divide-y divide-line">
            {a.evidence.map((e) => {
              const here = e.id === currentId;
              const body = (
                <>
                  {e.image_url && <img src={e.image_url} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-md object-cover" />}
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10px] text-dim">
                      {e.id}
                      {e.t != null && <span className="text-signal"> ▶ {formatMoment(e.t)}</span>}
                      {here && " · this file"}
                    </span>
                    <span className="block font-body text-[13px] leading-snug text-ink">{e.label}</span>
                  </span>
                </>
              );
              const cls = "flex w-full items-center gap-3 px-3.5 py-2.5 text-left";
              return (
                <li key={e.id}>
                  {here && e.t != null ? (
                    <button type="button" className={cls} onClick={() => onSeek(e.t!)}>{body}</button>
                  ) : (
                    <Link className={cls} to={`/doc/${encodeURIComponent(e.id)}${e.t != null ? `?t=${e.t}` : ""}`}>{body}</Link>
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
