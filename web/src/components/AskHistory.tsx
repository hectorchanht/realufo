// Ask mode with no question open: this browser's past questions and the
// public "shared questions" list (questions their askers shared). Tapping an item
// asks it, or opens its shared page when it has one. Each list hides when empty; the recent list also hides on error.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAskRecent } from "../api/queries";
import { clearAskHistory, readAskHistory } from "../lib/askHistory";

const HEAD = "mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-[.5px] text-faint";
const ITEM = "block w-full truncate rounded-lg border border-line px-2.5 py-1.5 text-left text-[12px] text-ink hover:border-signal";

export function AskHistory({ onPick }: { onPick: (q: string) => void }) {
  const [mine, setMine] = useState(readAskHistory);
  const { data } = useAskRecent();
  const recent = data?.recent ?? [];
  if (!mine.length && !recent.length) return null;

  return (
    <div className="mb-3.5 flex flex-col gap-3">
      {mine.length > 0 && (
        <section>
          <div className={HEAD}>
            <span>YOUR QUESTIONS</span>
            <button
              type="button"
              aria-label="clear your questions"
              onClick={() => {
                clearAskHistory();
                setMine([]);
              }}
              className="text-dim hover:text-signal"
            >
              clear
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {mine.map((q) => (
              <button key={q} type="button" onClick={() => onPick(q)} className={ITEM}>
                {q}
              </button>
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <div className={HEAD}>
            <span>SHARED QUESTIONS</span>
          </div>
          <div className="flex flex-col gap-1">
            {recent.map((r) => {
              const inner = (
                <>
                  <span className="min-w-0 flex-1 truncate">{r.question}</span>
                  <span className="flex-none font-mono text-[10px] text-faint">
                    {r.sources} {r.sources === 1 ? "source" : "sources"}
                  </span>
                </>
              );
              // A shared answer's page is free; rows shared before answers were stored re-ask.
              return r.url ? (
                <Link key={r.question} to={r.url} className={`${ITEM} flex items-center gap-2`}>
                  {inner}
                </Link>
              ) : (
                <button key={r.question} type="button" onClick={() => onPick(r.question)} className={`${ITEM} flex items-center gap-2`}>
                  {inner}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
