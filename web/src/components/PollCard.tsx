// Story poll (Spec 9): one tap per visitor; the split shows only after you vote (the API
// withholds it). The native X/Threads result is public, so it shows to everyone as a hook.
import { useRef } from "react";
import type { PollSocial } from "../api/types";
import { useCastPoll, usePoll } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";

const DOUBLE_TAP_MS = 600; // same guard as VerdictBar: a quick second tap isn't "clear my vote"
const MIN_CROWD = 5; // below this a percentage is noise
const NAMES: Record<PollSocial["platform"], string> = { x: "X", threads: "Threads" };
const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);
const votes = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;

function socialLine(s: PollSocial, opts: string[]) {
  const top = s.counts.indexOf(Math.max(...s.counts));
  return `On ${NAMES[s.platform]}: ${pct(s.counts[top], s.total)}% ${opts[top]} · ${votes(s.total)}${s.closed ? " (final)" : ""}`;
}

export function PollCard({ slug }: { slug: string }) {
  const { data } = usePoll(slug);
  const cast = useCastPoll(slug);
  const { toast } = useOverlay();
  const lastTap = useRef<{ o: number; t: number } | null>(null);
  if (!data) return null;

  const { q, opts, mine, total, tally, social } = data;
  const show = !!tally && total >= MIN_CROWD;
  const vote = (o: number) => {
    const t = Date.now();
    const prev = lastTap.current;
    lastTap.current = { o, t };
    if (prev?.o === o && t - prev.t < DOUBLE_TAP_MS) return;
    navigator.vibrate?.(5);
    cast.mutate(o, { onError: (e: Error) => toast(e.message) });
  };

  return (
    <section aria-label="Crowd poll" className="rounded-xl border border-line p-3">
      <div className="mb-1 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">CROWD POLL</div>
      <div className="mb-3 text-[15px] font-semibold text-ink">{q}</div>
      <div className="flex flex-col gap-2">
        {opts.map((label, i) => {
          const p = show ? pct(tally![i], total) : 0;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={mine === i}
              disabled={cast.isPending}
              onClick={() => vote(i)}
              className="relative min-h-[44px] overflow-hidden rounded-[10px] border px-3 text-left text-[14px] active:scale-[.99] disabled:opacity-60"
              style={{ borderColor: mine === i ? "var(--signal)" : "var(--line2)", color: mine === i ? "var(--ink)" : "var(--dim)" }}
            >
              {show && <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-line" style={{ width: `${p}%` }} />}
              <span className="relative flex justify-between gap-2">
                <span>{label}</span>
                {show && <span className="font-mono font-semibold">{p}%</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="mt-2 font-mono text-[11px] text-faint">
        {tally ? (
          total < MIN_CROWD ? `Early days — ${votes(total)}` : votes(total)
        ) : (
          <>
            <span aria-hidden="true">? ? ?</span> Vote to reveal the crowd{total ? ` · ${votes(total)}` : ""}
          </>
        )}
      </div>
      {social.filter((s) => s.total > 0).map((s) => (
        <div key={s.platform} className="mt-1 font-mono text-[11px] text-dim">{socialLine(s, opts)}</div>
      ))}
    </section>
  );
}
