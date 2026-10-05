// Spec 7 TL;DR ("懶人包"): AI-written, fact-checked at ingest (crawler ingest.tldr).
// Null → nothing, so files without one look exactly as before.
// The 3 bullets have fixed roles (crawler/ingest/tldr.py SYSTEM): 1 = facts (who/when/where)
// → small chips, 2 = what it reports → the headline, 3 = the file's conclusion → one quiet line.
// The joke one-liner stays in the data (feed, og:description) but not here.
// import { Share2 } from "lucide-react";
import type { Tldr } from "../api/types";
// import { useOverlay } from "../overlays/OverlayProvider";

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

export function TldrCard({ tldr, title, onBoring }: { tldr?: Tldr | null; title: string; onBoring?: () => void }) {
  if (!onBoring || title) {};
  // const { toast } = useOverlay();
  if (!tldr) return null;
  const { tags, headline, conclusion } = tldrParts(tldr);

  // const share = async () => {
  //   // ?v=<card hash>: WhatsApp & co cache a preview per URL, so a re-rendered card
  //   // only shows on a new URL. The canonical tag drops the query for search engines.
  //   const u = new URL(location.href);
  //   const v = /-en-([\w-]+)\.png$/.exec(tldr.cardUrl ?? "")?.[1];
  //   if (v) u.searchParams.set("v", v);
  //   const url = u.href;
  //   if (navigator.share) {
  //     try {
  //       return await navigator.share({ title, text: headline, url });
  //     } catch (e) {
  //       // A cancelled share sheet rejects with AbortError: nothing to report.
  //       // Anything else (NotAllowedError, no share target) falls back to copying.
  //       if ((e as Error)?.name === "AbortError") return;
  //     }
  //   }
  //   try {
  //     await navigator.clipboard.writeText(url);
  //     toast("Link copied");
  //   } catch {
  //     toast("Couldn't copy the link");
  //   }
  // };

  return (
    <section aria-label="TL;DR" className="relative mb-3 rounded-xl border border-line p-3">
      <span className="absolute top-0 right-2 font-mono text-[11px]" style={{color: "var(--signal)"}} >AI TL;DR</span>

      <p className="text-[17px] font-bold leading-[1.35] text-ink tracking-[.4px]">{headline}</p>

      {/* <div className="flex items-center gap-2 font-mono text-[11px] font-semibold">
        <div className="min-w-0 flex-1">
          {NONE.test(conclusion) ? (
            <span className="inline-block rounded-[7px] border border-dashed border-line2 px-2 py-0.5 text-[10px] font-normal uppercase tracking-[.4px] text-faint">
              No official conclusion
            </span>
          ) : (
            conclusion && (
              <p className="font-sans text-[13px] font-normal leading-[1.45] text-dim">
                <span className="mr-1.5 font-mono text-[10px] uppercase tracking-[.4px] text-faint">Finding</span>
                {conclusion}
              </p>
            )
          )}
        </div>
        <button type="button" onClick={share} aria-label="Share" title="Share" className="min-h-[36px] flex-none rounded-[9px] border border-line2 px-3 text-ink active:scale-[.97]">
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div> */}

      {tags.map((t, i) => (
        <span key={i} className="rounded-[7px] bg-bg2 px-2 py-0.5 text-[10px] font-normal tracking-normal text-dim">
          {t}
        </span>
      ))}

      <span className="absolute bottom-0 right-2 font-mono text-[11px]" style={{color: "var(--signal)"}} >
        {NONE.test(conclusion) ? 'No official conclusion': conclusion }
      </span>

    </section>
  );
}
