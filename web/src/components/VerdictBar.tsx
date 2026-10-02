// File verdict (Spec 6 Part A): one tap per visitor; the split is shown only
// after you vote (the API withholds the tally until then).
import type { Verdict, VerdictState } from "../api/types";
import { useCastVerdict } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";

const OPTIONS: { v: Verdict; label: string; color: string }[] = [
  { v: "explained", label: "EXPLAINED", color: "var(--signal)" },
  { v: "unexplained", label: "UNEXPLAINED", color: "var(--red)" },
  { v: "more_data", label: "NEED MORE DATA", color: "var(--amber)" },
];
const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);
const plural = (n: number) => `${n} ${n === 1 ? "verdict" : "verdicts"}`;

export function VerdictBar({ recordId, state }: { recordId: string; state?: VerdictState }) {
  const cast = useCastVerdict(recordId);
  const { toast } = useOverlay();
  const mine = state?.mine ?? null;
  const total = state?.total ?? 0;
  const tally = mine ? state?.tally : undefined;

  const vote = (v: Verdict) => {
    navigator.vibrate?.(5);
    cast.mutate(v, { onError: (e: Error) => toast(e.message) });
  };

  return (
    <section aria-label="Your verdict" className="mb-[22px] rounded-xl border border-line p-3">
      <div className="mb-2 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">YOUR VERDICT</div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={mine === o.v}
            disabled={cast.isPending}
            onClick={() => vote(o.v)}
            className="min-h-[44px] rounded-[10px] border px-1 font-mono text-[10.5px] font-semibold active:scale-[.97] disabled:opacity-60"
            style={{ borderColor: mine === o.v ? o.color : "var(--line2)", color: mine === o.v ? o.color : "var(--dim)" }}
          >
            {o.label}
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
          <div className="mt-1 font-mono text-[10px] text-faint">{plural(total)}</div>
        </>
      ) : (
        <div className="mt-2 font-mono text-[10px] text-faint">
          {mine ? "…" : total ? `${plural(total)} so far — vote to see the split` : "Be the first to weigh in"}
        </div>
      )}
    </section>
  );
}
