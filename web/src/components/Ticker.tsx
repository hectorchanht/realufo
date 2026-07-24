// LIVE marquee strip (Feed screen). Ported from
// realufo-handoff/RealUFO.dc.html lines 114-117: a "LIVE" chip + an
// infinitely-scrolling row of `{board} {text}` items. The prototype's
// `tickerRow` (line 578) is rendered twice back-to-back inside the animated
// track (`{{ tickerRow }}{{ tickerRow }}`) so the loop is seamless — the
// `marquee` keyframes (theme.css, ported from prototype line 56) translate
// exactly -50%, i.e. exactly one full copy's width, before snapping back to
// 0%. Reproduced here as two renders of the same `row` JSX.
import type { TickerItem } from "../api/types";

export interface TickerProps {
  items: TickerItem[];
}

function Row({ items }: { items: TickerItem[] }) {
  return (
    <span className="inline-flex gap-[34px]">
      {items.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-[7px]">
          <span className="font-bold text-signal">{t.board}</span>
          <span>{t.text}</span>
        </span>
      ))}
    </span>
  );
}

export function Ticker({ items }: TickerProps) {
  return (
    <div data-ticker className="mb-5 flex items-center overflow-hidden rounded-xl border border-line bg-surface">
      <div
        className="flex flex-none items-center gap-[7px] border-r border-line px-3 py-[9px] font-mono text-[10px] font-bold tracking-[1px] text-signal"
        style={{ background: "var(--signal-dim)" }}
      >
        <span className="h-[7px] w-[7px] animate-[blink_1.4s_infinite] rounded-full bg-signal" />
        LIVE
      </div>
      <div className="flex-1 overflow-hidden whitespace-nowrap">
        <div className="inline-flex animate-[marquee_26s_linear_infinite] gap-[34px] pl-4 font-mono text-[11.5px] text-dim">
          <Row items={items} />
          <Row items={items} />
        </div>
      </div>
    </div>
  );
}

export default Ticker;
