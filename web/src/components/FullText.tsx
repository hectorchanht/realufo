import { useEffect, useRef, useState } from "react";
import type { FullText as FullTextData } from "../api/types";
import { chip, off, on } from "./ImageTools";

// PDF text under the doc summary (spec 2026-10-02-realufo-doc-fulltext). With
// an AI summary (crawler ingest.summaries) an AI SUMMARY | FULL TEXT toggle
// shows one at a time, summary first. All pages sit in a scroll box so a long
// document doesn't push the rest of the page away. Images have no page text,
// only an AI visual description (crawler ingest.visuals), shown on its own.
export default function FullText({
  data,
  kind,
  page,
  onOpenOriginal,
}: {
  data: FullTextData | null | undefined;
  kind?: string;
  /** ?p=N: open the text view scrolled to (and marking) page N. */
  page?: number;
  onOpenOriginal: () => void;
}) {
  const [view, setView] = useState<"summary" | "text">(page ? "text" : "summary");
  const box = useRef<HTMLDivElement>(null);
  const hasPage = !!page && !!data?.pages.some((p) => p.n === page);
  useEffect(() => {
    if (!page) return;
    setView("text");
    const el = box.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (el && box.current) {
      box.current.scrollTo?.({ top: el.offsetTop - box.current.offsetTop - 8 });
      el.closest("section")?.scrollIntoView?.({ block: "start" });
    }
  }, [page, data]);
  if (!data?.pages.length) {
    if (!data?.aiSummary) return null;
    const label = kind === "image" ? "AI VISUAL DESCRIPTION" : "AI SUMMARY";
    return (
      <section aria-label={label} className="mb-[22px]">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-mono">
          <h2 className="text-[11px] font-semibold tracking-[.5px] text-ink">{label}</h2>
          <span className="text-[10px] text-amber">
            {kind === "image" ? "AI-generated from the image · may contain errors" : "AI-generated · may contain errors"}
          </span>
        </div>
        <p className="text-[13.5px] leading-[1.65] text-dim">{data.aiSummary}</p>
      </section>
    );
  }
  const showSummary = !!data.aiSummary && view === "summary";
  const tab = (k: "summary" | "text", label: string) => (
    <button
      key={k}
      type="button"
      aria-pressed={(k === "summary") === showSummary}
      onClick={() => setView(k)}
      className={`${chip} ${(k === "summary") === showSummary ? on : off} px-[7px] py-[2px] text-[9px]`}
    >
      {label}
    </button>
  );
  return (
    <section aria-label="Full text" className="mb-[22px]">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 font-mono">
        {data.aiSummary ? (
          <span className="flex gap-1">
            {tab("summary", "AI SUMMARY")}
            {tab("text", "FULL TEXT")}
          </span>
        ) : (
          <h2 className="text-[11px] font-semibold tracking-[.5px] text-ink">FULL TEXT</h2>
        )}
        <span className={`text-[10px] ${showSummary ? "text-amber" : "text-faint"}`}>
          {showSummary
            ? "AI-generated from OCR text · may contain errors"
            : `${data.pages.length} of ${data.total_pages} pages · OCR, may contain errors`}
        </span>
      </div>
      {showSummary ? (
        <p className="text-[13.5px] leading-[1.65] text-dim">{data.aiSummary}</p>
      ) : (
        <>
          {page && !hasPage && (
            <button
              type="button"
              onClick={onOpenOriginal}
              className="mb-2 w-full rounded-xl border border-signal px-3 py-2 text-left font-mono text-[11px] text-signal"
            >
              Page {page} isn't in the extracted text: open it in the original file →
            </button>
          )}
          <div
            ref={box}
            tabIndex={0}
            aria-label="Full text pages"
            className="max-h-[420px] overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface px-3.5 pt-3"
          >
            {data.pages.map((p) => (
              <div
                key={p.n}
                data-page={p.n}
                className={`mb-4 ${p.n === page ? "-mx-2 rounded-lg px-2 py-1 ring-1 ring-signal" : ""}`}
              >
                <div className={`mb-1 font-mono text-[9px] tracking-[.5px] ${p.n === page ? "text-signal" : "text-faint"}`}>PAGE {p.n}</div>
                <p className="text-[13.5px] leading-[1.65] text-dim" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                  {p.text}
                </p>
              </div>
            ))}
          </div>
          {data.truncated && (
            <button
              type="button"
              onClick={onOpenOriginal}
              className="mt-3 w-full rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.99]"
            >
              Text continues in the original file →
            </button>
          )}
        </>
      )}
    </section>
  );
}
