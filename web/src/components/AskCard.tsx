// "Ask the Archive" answer card (Spec 3 §4.4), shared by the live answer
// (AskAnswer) and a shared answer's page (AskShared). Answer is plain text;
// each [n] becomes a button that scrolls to + flashes source n.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import { docTitleParts } from "../lib/docTitle";
import { absUrl, type ShareResult } from "../lib/shareLink";
import type { AskSource, HubKind, HubLinks } from "../api/types";

// Same title rule as cards: id prefix stripped, id shown once unless it only respells the title.
const srcTitle = (s: { record_id: string; title: string; kind?: string }) => docTitleParts(s.record_id, s.title, s.kind);

export const CARD = "mb-3.5 rounded-xl border border-line2 bg-surface px-[13px] py-3";
export const ACTION = "rounded-md border border-line2 px-2.5 py-1 font-mono text-[10px] text-signal hover:border-signal disabled:opacity-50";

const CHIP_KINDS: HubKind[] = ["release", "agency", "location", "decade"];

// Small links from a source row to the hubs it belongs to (R06, FBI, 1950s…).
function HubChips({ hubs, labels }: { hubs?: HubLinks; labels: Map<string, string> }) {
  if (!hubs) return null;
  const chips = CHIP_KINDS.filter((k) => hubs[k]).map((k) => {
    const slug = hubs[k]!;
    const text = k === "release" ? `R${slug.padStart(2, "0")}` : k === "decade" ? slug : (labels.get(`${k}/${slug}`) ?? slug);
    return (
      <Link
        key={k}
        to={`/${k}/${slug}`}
        className="rounded-[5px] border border-line px-1.5 py-px font-mono text-[9px] text-dim hover:text-signal"
      >
        {text}
      </Link>
    );
  });
  return chips.length ? <span className="mt-0.5 flex flex-wrap gap-1">{chips}</span> : null;
}

export function AskCard({ question, data, footer }: { question: string; data: { answer: string; sources: AskSource[] }; footer?: ReactNode }) {
  const [flash, setFlash] = useState<number | null>(null);
  const { data: hubsData } = useHubs();
  const hubLabels = new Map((hubsData?.hubs ?? []).map((h) => [`${h.kind}/${h.slug}`, h.label]));

  function cite(n: number) {
    document.getElementById(`ask-src-${n}`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    setFlash(n);
    setTimeout(() => setFlash((cur) => (cur === n ? null : cur)), 1200);
  }

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
              <Link to={`/doc/${s.record_id}`} className="flex items-center gap-2">
                <span className="w-5 flex-none font-mono text-[10px] text-faint">[{s.n}]</span>
                {s.thumb && <img src={s.thumb} alt="" loading="lazy" className="h-8 w-8 flex-none rounded object-cover" />}
              </Link>
              {/* title + hub chips stack so chips wrap below instead of squeezing the title on phones */}
              <div className="flex min-w-0 flex-1 flex-col">
                <Link to={`/doc/${s.record_id}`} className="truncate text-[12px] text-ink hover:text-signal">
                  {srcTitle(s).title}
                  {srcTitle(s).showId && <span className="font-mono text-[10px] text-faint"> · {srcTitle(s).id}</span>}
                </Link>
                <HubChips hubs={s.hubs} labels={hubLabels} />
              </div>
              {s.ai && (
                <span
                  title="Matched an AI-written description of this file, not the file's own text"
                  className="flex-none rounded-[5px] border border-line px-1.5 py-px font-mono text-[9px] text-dim"
                >
                  {s.ai === "summary" ? "AI summary" : "AI moments"}
                </span>
              )}
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
      <p className="mt-2.5 font-mono text-[9.5px] text-faint">
        AI answer drawn from archive text, OCR &amp; AI descriptions — can be wrong. Check the sources.
      </p>
      {footer && <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">{footer}</div>}
    </section>
  );
}

// What happened after a share: "link copied", or the link itself to copy by hand.
export function ShareNote({ result, url }: { result: ShareResult | null; url: string }) {
  if (result === "copied") return <span className="font-mono text-[10px] text-faint">link copied</span>;
  if (result !== "failed") return null;
  return (
    <input
      readOnly
      value={absUrl(url)}
      aria-label="share link"
      onFocus={(e) => e.currentTarget.select()}
      className="min-w-0 flex-1 rounded-md border border-line bg-transparent px-2 py-1 font-mono text-[10px] text-ink"
    />
  );
}
