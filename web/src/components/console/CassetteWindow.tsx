// Walkman cassette window: what is going on, at a glance — timecode
// (video) or zoom (image), the active preset name, the speed. Two reels sit
// either side and turn while the video plays (still under
// prefers-reduced-motion). The reels earn their place: playback state without
// opening anything.
function Reel({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      aria-hidden="true"
      className={`flex-none text-dim ${spinning ? "animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none" : ""}`}
    >
      <circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {[0, 120, 240].map((d) => (
        <line
          key={d}
          x1="15"
          y1="15"
          x2={15 + 10 * Math.sin((d * Math.PI) / 180)}
          y2={15 - 10 * Math.cos((d * Math.PI) / 180)}
          stroke="currentColor"
          strokeWidth="2.5"
        />
      ))}
      <circle cx="15" cy="15" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function CassetteWindow({
  main,
  sub,
  spinning,
}: {
  /** Timecode or zoom: the big readout. */
  main: string;
  /** Preset name · speed: the small line. */
  sub: string;
  spinning: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-line2 bg-bg px-3.5 py-2.5">
      <Reel spinning={spinning} />
      <div className="min-w-0 flex-1 text-center">
        <div className="truncate font-mono text-[14px] tabular-nums text-ink">{main}</div>
        <div className="truncate font-mono text-[9px] tracking-[.6px] text-faint">{sub}</div>
      </div>
      <Reel spinning={spinning} />
    </div>
  );
}
