// Spec 7 TL;DR ("懶人包"): AI-written, fact-checked at ingest (crawler ingest.tldr).
// Null → nothing, so files without one look exactly as before.
import type { Tldr } from "../api/types";
import { useOverlay } from "../overlays/OverlayProvider";

export function TldrCard({ tldr, title, onBoring }: { tldr?: Tldr | null; title: string; onBoring: () => void }) {
  const { toast } = useOverlay();
  if (!tldr) return null;

  const share = async () => {
    const url = location.href;
    if (navigator.share) {
      // A cancelled share sheet rejects with AbortError: nothing to report.
      await navigator.share({ title, text: tldr.oneLiner, url }).catch(() => {});
      return;
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
        <span className="text-faint">TL;DR · 懶人包</span>
        <span className="text-[9.5px] font-normal text-faint">AI-written · facts from the file</span>
      </div>
      <p className="mb-2.5 text-[17px] font-bold leading-[1.35]" style={{ color: "var(--signal)" }}>
        “{tldr.oneLiner}”
      </p>
      <ul className="mb-3 list-disc space-y-1 pl-4 text-[13.5px] leading-[1.5] text-dim">
        {tldr.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      <div className="flex justify-between gap-2 font-mono text-[11px] font-semibold">
        <button type="button" onClick={share} className="min-h-[36px] rounded-[9px] border border-line2 px-3 text-ink active:scale-[.97]">
          ↗ Share
        </button>
        <button type="button" onClick={onBoring} className="min-h-[36px] px-1 text-dim">
          Boring version ↓
        </button>
      </div>
    </section>
  );
}
