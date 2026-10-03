import { useEffect, useRef, useState } from "react";
import type { FullText as FullTextData } from "../api/types";
import { chip, off, on } from "./ImageTools";
import { formatPage } from "../../../worker/lib/ocrMarkdown";

type Page = { n: number; text: string; src?: string; conf?: number };

// Every page of the file (Worker GET /api/records/:id/text, R2 text/<id>.json for
// re-OCR'd PDFs); the D1 pages in `data` are capped, so they only show until this loads.
const loadAll = async (id: string): Promise<Page[]> => {
  const res = await fetch(`/api/records/${encodeURIComponent(id)}/text?format=json`);
  if (!res.ok) throw new Error(`full text ${res.status}`);
  return ((await res.json()) as { pages: Page[] }).pages;
};

// PDF text under the doc summary (spec 2026-10-02-realufo-doc-fulltext). With
// an AI summary (crawler ingest.summaries) an AI SUMMARY | FULL TEXT toggle
// shows one at a time, summary first. The text is paginated, one PDF page at a
// time (spec 2026-10-03-realufo-paddleocr-reocr), as Markdown or as JSON; the
// whole file is linked as .md / .json. Images have no page text, only an AI
// visual description (crawler ingest.visuals), shown on its own.
export default function FullText({
  id,
  data,
  kind,
  page,
  onPageChange,
  onOpenOriginal,
  load = loadAll,
}: {
  id: string;
  data: FullTextData | null | undefined;
  kind?: string;
  /** ?p=N: open the text view on page N. */
  page?: number;
  /** Page turned (Doc mirrors it into ?p=N so every page has a link). */
  onPageChange?: (n: number) => void;
  onOpenOriginal: () => void;
  load?: (id: string) => Promise<Page[]>;
}) {
  const [view, setView] = useState<"summary" | "text">(page ? "text" : "summary");
  const [format, setFormat] = useState<"md" | "json">("md");
  const [all, setAll] = useState<Page[] | null>(null);
  const [cur, setCur] = useState<number | undefined>(page);
  const hasText = !!data?.pages.length;
  useEffect(() => {
    if (!hasText) return;
    let live = true;
    load(id).then((p) => live && p.length && setAll(p)).catch(() => {}); // keep the capped pages
    return () => { live = false; };
  }, [id, hasText, load]);
  const section = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const turned = useRef<number | undefined>(undefined); // last page set by our own prev/next, echoed back as ?p=
  useEffect(() => {
    if (!page) return;
    setView("text");
    setCur(page);
    // A ?p=N link from elsewhere jumps to the block; our own page turns keep the scroll.
    if (page !== turned.current) section.current?.scrollIntoView?.({ block: "start" });
  }, [page]);
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
  const pages: Page[] = all ?? data.pages;
  const idx = Math.max(0, pages.findIndex((p) => p.n === cur));
  const shown = pages[idx];
  const missing = !!cur && !pages.some((p) => p.n === cur);
  const go = (i: number) => {
    const n = pages[i].n;
    turned.current = n;
    if (box.current) box.current.scrollTop = 0; // a new page starts at its top
    setCur(n);
    onPageChange?.(n);
  };
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
  const fmt = (k: "md" | "json", label: string) => (
    <button
      key={k}
      type="button"
      aria-pressed={format === k}
      onClick={() => setFormat(k)}
      className={`${chip} ${format === k ? on : off} px-[7px] py-[2px] text-[9px]`}
    >
      {label}
    </button>
  );
  const arrow = "rounded-lg border border-line2 px-2.5 py-1 font-mono text-[11px] text-ink disabled:opacity-30";
  const textUrl = `/doc/${encodeURIComponent(id)}/text`;
  return (
    <section ref={section} aria-label="Full text" className="mb-[22px]">
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
            : `${all ? pages.length : `${pages.length} of ${data.total_pages}`} pages · OCR, may contain errors`}
        </span>
      </div>
      {showSummary ? (
        <p className="text-[13.5px] leading-[1.65] text-dim">{data.aiSummary}</p>
      ) : (
        <>
          {missing && (
            <button
              type="button"
              onClick={onOpenOriginal}
              className="mb-2 w-full rounded-xl border border-signal px-3 py-2 text-left font-mono text-[11px] text-signal"
            >
              Page {cur} isn't in the extracted text: open it in the original file →
            </button>
          )}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono">
            <span className="flex items-center gap-1.5">
              <button type="button" aria-label="Previous page" disabled={idx === 0} onClick={() => go(idx - 1)} className={arrow}>‹</button>
              <span className="text-[10px] tracking-[.5px] text-signal">PAGE {shown.n} / {all ? pages.length : data.total_pages}</span>
              <button type="button" aria-label="Next page" disabled={idx >= pages.length - 1} onClick={() => go(idx + 1)} className={arrow}>›</button>
            </span>
            <span className="flex items-center gap-1">
              {fmt("md", "MD")}
              {fmt("json", "JSON")}
              <a href={textUrl} target="_blank" rel="noopener" className="ml-1.5 text-[10px] text-faint underline">↗ .md</a>
              <a href={`${textUrl}?format=json`} target="_blank" rel="noopener" className="text-[10px] text-faint underline">.json</a>
            </span>
          </div>
          <div
            ref={box}
            tabIndex={0}
            aria-label="Full text page"
            data-page={shown.n}
            // Own scroller on desktop only: on phones an 80vh nested scroller traps the
            // swipe (the page never moves), so there the text just flows in the page.
            className="rounded-xl border border-line bg-surface px-3.5 py-3 min-[900px]:max-h-[80vh] min-[900px]:overflow-y-auto"
          >
            {format === "json" ? (
              <pre className="font-mono text-[11.5px] leading-[1.5] text-dim" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(shown, null, 2)}
              </pre>
            ) : (
              <>
                <div className="mb-1 font-mono text-[9px] tracking-[.5px] text-faint">## PAGE {shown.n}</div>
                <OcrMarkdown text={shown.text} />
              </>
            )}
          </div>
          {data.truncated && !all && (
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

// The lossless OCR -> Markdown blocks (worker/lib/ocrMarkdown), rendered straight to
// elements: no Markdown parser, so OCR text can never become HTML.
function OcrMarkdown({ text }: { text: string }) {
  const blocks = formatPage(text);
  if (!blocks.length) return <p className="text-[13.5px] text-faint">(no text on this page)</p>;
  return (
    <div className="text-[13.5px] leading-[1.65] text-dim" style={{ overflowWrap: "anywhere" }}>
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h3 key={i} className="mb-1.5 mt-3 font-mono text-[11.5px] font-semibold tracking-[.5px] text-ink first:mt-0">
            {b.text}
          </h3>
        ) : (
          <p key={i} className="mb-2.5">
            {b.lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l.label && <strong className="font-semibold text-ink">{l.label}</strong>}
                {l.label && " "}
                {l.text}
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
