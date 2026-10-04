// Spec 7 TL;DR ("懶人包"): AI-written, fact-checked at ingest (crawler ingest.tldr).
// Null → nothing, so files without one look exactly as before.
import { Share2 } from "lucide-react";
import type { Tldr } from "../api/types";
import { useOverlay } from "../overlays/OverlayProvider";

export function TldrCard({ tldr, title, onBoring }: { tldr?: Tldr | null; title: string; onBoring: () => void }) {
  const { toast } = useOverlay();
  if (!tldr) return null;

  const share = async () => {
    // ?v=<card hash>: WhatsApp & co cache a preview per URL, so a re-rendered card
    // only shows on a new URL. The canonical tag drops the query for search engines.
    const u = new URL(location.href);
    const v = /-en-([\w-]+)\.png$/.exec(tldr.cardUrl ?? "")?.[1];
    if (v) u.searchParams.set("v", v);
    const url = u.href;
    if (navigator.share) {
      try {
        return await navigator.share({ title, text: tldr.oneLiner, url });
      } catch (e) {
        // A cancelled share sheet rejects with AbortError: nothing to report.
        // Anything else (NotAllowedError, no share target) falls back to copying.
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy the link");
    }
  };

  return (
    <section aria-label="TL;DR" className="mb-3 rounded-xl border border-line p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2 font-mono text-[11px] font-semibold tracking-[.4px]">
        <span className="text-faint">TL;DR</span>
        <span className="text-[9.5px] font-normal text-faint">AI-written with facts</span>
      </div>
      <p className="mb-2.5 text-[17px] font-bold leading-[1.35] text-ink">
        <span style={{ color: "var(--signal)" }}>“</span>
        {tldr.oneLiner}
        <span style={{ color: "var(--signal)" }}>”</span>
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-[13.5px] leading-[1.5] text-dim">
        {tldr.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <div className="flex justify-between gap-2 font-mono text-[11px] font-semibold">
        <button type="button" onClick={share} aria-label="Share" title="Share" className="min-h-[36px] rounded-[9px] border border-line2 px-3 text-ink active:scale-[.97]">
          <Share2 size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <button type="button" onClick={onBoring} className="min-h-[36px] px-1 text-dim">
          Boring version ↓
        </button>
      </div>
    </section>
  );
}
