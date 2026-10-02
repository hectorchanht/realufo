import type { FullText as FullTextData } from "../api/types";

// PDF text under the doc summary (spec 2026-10-02-realufo-doc-fulltext). The
// same pages the Worker pre-renders for crawlers; pages after the first sit
// in a native <details>, which keeps them in the DOM while collapsed.
export default function FullText({
  data,
  onOpenOriginal,
}: {
  data: FullTextData | null | undefined;
  onOpenOriginal: () => void;
}) {
  if (!data?.pages.length) return null;
  const [first, ...rest] = data.pages;
  const page = (p: { n: number; text: string }) => (
    <div key={p.n} className="mb-4">
      <div className="mb-1 font-mono text-[9px] tracking-[.5px] text-faint">PAGE {p.n}</div>
      <p className="text-[13.5px] leading-[1.65] text-dim" style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
        {p.text}
      </p>
    </div>
  );
  return (
    <section aria-label="Full text" className="mb-[22px]">
      <div className="mb-2 flex items-baseline justify-between gap-3 font-mono">
        <h2 className="text-[11px] font-semibold tracking-[.5px] text-ink">FULL TEXT</h2>
        <span className="text-[10px] text-faint">
          {data.pages.length} of {data.total_pages} pages · OCR, may contain errors
        </span>
      </div>
      {page(first)}
      {rest.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer font-mono text-xs text-ink">Show all {data.pages.length} pages</summary>
          <div className="mt-3">{rest.map(page)}</div>
        </details>
      )}
      {data.truncated && (
        <button
          type="button"
          onClick={onOpenOriginal}
          className="w-full rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.99]"
        >
          Text continues in the original file →
        </button>
      )}
    </section>
  );
}
