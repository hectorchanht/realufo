// File verdict (Spec 6 Part A): one tap per visitor; the split is shown only
// after you vote (the API withholds the tally until then).
import { useRef } from "react";
import { BadgeCheck, CircleHelp, FileSearch } from "lucide-react";
import type { Verdict, VerdictState } from "../api/types";
import { useCastVerdict } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";

// Icon-only verdicts: no English text on the buttons, so readers of any
// language can judge. The English label survives as aria-label/title for
// screen readers, tooltips, and tests.
const OPTIONS: { v: Verdict; label: string; color: string; Icon: typeof BadgeCheck }[] = [
  { v: "explained", label: "EXPLAINED", color: "var(--signal)", Icon: BadgeCheck },
  { v: "unexplained", label: "UNEXPLAINED", color: "var(--red)", Icon: CircleHelp },
  { v: "more_data", label: "NEED MORE DATA", color: "var(--amber)", Icon: FileSearch },
];
const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);
// A second tap on the same option inside this window is a double-tap, not "clear my vote".
const DOUBLE_TAP_MS = 600;
// Below this many verdicts a big percentage is noise ("100% unexplained" from 1 vote).
const MIN_CROWD = 5;
// "? ? ?" is decoration: screen readers hear just the instruction.
const TEASE = (
  <>
    <span aria-hidden="true">? ? ?</span> Judge it to reveal the crowd
  </>
);
const plural = (n: number) => `${n} ${n === 1 ? "verdict" : "verdicts"}`;

export function VerdictBar({
  recordId,
  state,
  onVoted,
}: {
  recordId: string;
  state?: VerdictState;
  /** Fired after a fresh vote lands (not when a re-tap clears the vote). */
  onVoted?: () => void;
}) {
  const cast = useCastVerdict(recordId);
  const { toast } = useOverlay();
  const mine = state?.mine ?? null;
  const total = state?.total ?? 0;
  const tally = mine ? state?.tally : undefined;

  const lastTap = useRef<{ v: Verdict; t: number } | null>(null);

  const vote = (v: Verdict) => {
    const t = Date.now();
    const prev = lastTap.current;
    lastTap.current = { v, t };
    if (prev?.v === v && t - prev.t < DOUBLE_TAP_MS) return;
    navigator.vibrate?.(5);
    // Tapping the already-selected option clears the vote (useCastVerdict
    // flips `mine` back to null) — only a genuinely new vote counts.
    const fresh = mine !== v;
    cast.mutate(v, {
      onError: (e: Error) => toast(e.message),
      onSuccess: () => {
        if (fresh) onVoted?.();
      },
    });
  };

  return (
    <section aria-label="WTF-meter" className="mb-[22px] rounded-xl border border-line p-3">
      {/* <div className="mb-2 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">WTF-METER</div> */}
      {/* always mounted so the number is announced when it appears after a vote */}
      <div aria-live="polite">
        {tally && total >= MIN_CROWD && (
          <div className="mb-2 font-mono text-[20px] font-bold" style={{ color: "var(--red)" }}>
            {pct(tally.unexplained, total)}% UNEXPLAINED
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-label={o.label}
            title={o.label}
            aria-pressed={mine === o.v}
            disabled={cast.isPending}
            onClick={() => vote(o.v)}
            className="grid min-h-[56px] place-items-center rounded-[10px] border active:scale-[.97] disabled:opacity-60"
            style={{ borderColor: mine === o.v ? o.color : "var(--line2)", color: mine === o.v ? o.color : "var(--dim)" }}
          >
            <o.Icon size={24} aria-hidden="true" />
          </button>
        ))}
      </div>
      {tally ? (
        <>
          <div
            role="img"
            aria-label={OPTIONS.map((o) => `${o.label.toLowerCase()} ${pct(tally[o.v], total)}%`).join(", ")}
            className="mt-3 flex h-2 overflow-hidden rounded-full bg-line"
          >
            {OPTIONS.map((o) => (
              <div key={o.v} style={{ width: `${pct(tally[o.v], total)}%`, background: o.color }} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-dim">
            {OPTIONS.map((o) => (
              <span key={o.v}>{pct(tally[o.v], total)}%</span>
            ))}
          </div>
          <div className="mt-1 font-mono text-[10px] text-faint">
            {total >= MIN_CROWD ? plural(total) : `Early days — ${plural(total)}`}
          </div>
        </>
      ) : (
        <div className="mt-2 font-mono text-[10px] text-faint">
          {mine ? "…" : <>{TEASE}{total ? ` · ${plural(total)}` : ""}</>}
        </div>
      )}
    </section>
  );
}
