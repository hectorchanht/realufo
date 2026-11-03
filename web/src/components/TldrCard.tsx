// Spec 7 TL;DR ("懶人包"): AI-written, fact-checked at ingest (crawler ingest.tldr).
// Null → nothing, so files without one look exactly as before.
// The 3 bullets have fixed roles (crawler/ingest/tldr.py SYSTEM): 1 = facts (who/when/where)
// → small chips, 2 = what it reports → the headline, 3 = the file's conclusion → one quiet line.
// The joke one-liner stays in the data (feed, og:description) but not here.
import { useState } from "react";
import type { Tldr } from "../api/types";

const NONE = /^no official conclusion/i;
// "date unspecified", "location unknown": a chip that says nothing
const EMPTY = /\b(unspecified|unknown|n\/a)\b/i;

function tldrParts(t: Tldr) {
  const [facts = "", report, conclusion = ""] = t.bullets;
  return {
    // ", " only: "1,000 ft" and "341_110677_Numerical_File,_5-2500" stay whole
    tags: facts.replace(/\.$/, "").split(/,\s+/).map((x) => x.trim()).filter((x) => x && !EMPTY.test(x)),
    headline: report || t.oneLiner,
    conclusion: conclusion.replace(/^(conclusion|finding)s?:\s*/i, "").trim(),
  };
}

export function TldrCard({ tldr }: { tldr?: Tldr | null }) {
  // Before the early return so hook order never changes between files with and without a TL;DR.
  const [revealed, setRevealed] = useState(false);
  if (!tldr) return null;
  const { tags, headline, conclusion } = tldrParts(tldr);

  return (
    <section aria-label="TL;DR" className="relative mb-4 rounded-xl border border-line p-3">
      <span className="absolute right-2 top-0 font-mono text-[10px] tracking-[.4px] text-faint">AI TL;DR</span>

      {/* the h1 leads; the TL;DR headline sits one step below it */}
      <p className="pr-12 text-[15px] font-semibold leading-[1.4] text-ink">{headline}</p>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span key={i} className="rounded-[7px] bg-bg2 px-2 py-0.5 font-mono text-[11px] text-dim">
              {t}
            </span>
          ))}
        </div>
      )}
      {NONE.test(conclusion) ? (
        <span className="mt-2 inline-block rounded-[7px] border border-dashed border-line2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.4px] text-dim">
          No official conclusion
        </span>
      ) : (
        conclusion && (
          // The third line is the file's conclusion: it reads too sharp at a glance,
          // so it stays blurred until the reader hovers, taps or focuses it.
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-expanded={revealed}
            title={revealed ? "Hide the finding" : "Reveal the finding"}
            className={`mt-2 block w-full cursor-pointer select-none text-left text-[13px] leading-[1.45] text-ink transition-[filter] duration-200 ${
              revealed ? "" : "blur-[3px] hover:blur-none focus-visible:blur-none active:blur-none"
            }`}
          >
            {conclusion}
          </button>
        )
      )}
    </section>
  );
}
