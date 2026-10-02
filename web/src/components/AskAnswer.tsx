// "Ask the Archive" answer card (Spec 3 §4.4). Answer is plain text; each [n]
// becomes a button that scrolls to + flashes source n.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAsk } from "../api/queries";
import { ApiError } from "../api/client";
import type { AskResponse } from "../api/types";

const CARD = "mb-3.5 rounded-xl border border-line2 bg-surface px-[13px] py-3";

function errorCopy(e: unknown) {
  if (e instanceof ApiError && e.status === 429) return "slow down — too many questions";
  if (e instanceof ApiError && e.status === 503) return "Ask is resting — try again later";
  return null;
}

export function AskAnswer({ question, onPost }: { question: string; onPost?: (data: AskResponse) => void }) {
  const { data, isLoading, error, refetch } = useAsk(question);
  const [flash, setFlash] = useState<number | null>(null);

  function cite(n: number) {
    document.getElementById(`ask-src-${n}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    setFlash(n);
    setTimeout(() => setFlash((cur) => (cur === n ? null : cur)), 1200);
  }

  if (isLoading) return <div className={`${CARD} font-mono text-[11px] text-faint`}>◉ consulting the archive…</div>;
  if (error) {
    const copy = errorCopy(error);
    return (
      <div className={`${CARD} flex items-center gap-3 font-mono text-[11px] text-dim`}>
        <span className="flex-1">{copy ?? "Couldn't reach the archive — try again"}</span>
        {!copy && (
          <button type="button" onClick={() => refetch()} className="rounded-md border border-line2 px-2 py-0.5 text-signal">
            retry
          </button>
        )}
      </div>
    );
  }
  if (!data) return null;

  const parts = data.answer.split(/(\[\d+\])/);
  return (
    <section className={CARD} aria-label="archive answer">
      <div className="mb-1 font-mono text-[9px] tracking-[.5px] text-signal">◉ ARCHIVE ANSWER</div>
      <div className="mb-2 font-mono text-[11px] text-faint">{question}</div>
      <p className="whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink">
        {parts.map((p, i) => {
          const m = /^\[(\d+)\]$/.exec(p);
          if (!m) return p;
          const n = Number(m[1]);
          return (
            <sup key={i}>
              <button type="button" aria-label={`source ${n}`} onClick={() => cite(n)} className="px-0.5 font-mono text-[10px] text-cyan">
                [{n}]
              </button>
            </sup>
          );
        })}
      </p>
      {data.sources.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5">
          {data.sources.map((s) => (
            <li
              key={s.n}
              id={`ask-src-${s.n}`}
              data-flash={flash === s.n ? "true" : "false"}
              className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5 transition-colors data-[flash=true]:border-signal"
            >
              <span className="w-5 flex-none font-mono text-[10px] text-faint">[{s.n}]</span>
              {s.thumb && <img src={s.thumb} alt="" loading="lazy" className="h-8 w-8 flex-none rounded object-cover" />}
              <Link to={`/doc/${s.record_id}`} className="min-w-0 flex-1 truncate text-[12px] text-ink hover:text-signal">
                {s.title} <span className="font-mono text-[10px] text-faint">· {s.record_id}</span>
              </Link>
              {s.kind === "pdf" && s.page > 0 && (
                <a
                  href={`/api/file/${encodeURIComponent(s.record_id)}#page=${s.page}`}
                  target="_blank"
                  rel="noopener"
                  className="flex-none font-mono text-[10px] text-cyan"
                >
                  open at p.{s.page}
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2.5 flex items-center gap-3">
        <span className="flex-1 font-mono text-[9.5px] text-faint">
          AI answer drawn from archive text &amp; OCR — can be wrong. Check the sources.
        </span>
        {onPost && data.sources.length > 0 && (
          <button
            type="button"
            onClick={() => onPost(data)}
            className="flex-none rounded-md border border-line2 px-2 py-0.5 font-mono text-[10px] text-signal hover:border-signal"
          >
            ⤴ post to a board
          </button>
        )}
      </div>
    </section>
  );
}

export default AskAnswer;
