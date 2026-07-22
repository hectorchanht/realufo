// Pixel saucer mark. Ported from realufo-handoff/RealUFO.dc.html lines 554-564
// (React.createElement form) into plain JSX. Fills are CSS vars so the mark
// re-colors with theme/accent for free — no props needed.
export function Saucer() {
  return (
    <svg
      width={26}
      height={16}
      viewBox="0 0 26 16"
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden="true"
    >
      <g fill="var(--signal)">
        <rect x={10} y={1} width={6} height={2} />
        <rect x={8} y={3} width={10} height={2} />
        <rect x={2} y={6} width={22} height={2} />
        <rect x={0} y={8} width={26} height={2} />
        <rect x={4} y={10} width={4} height={2} />
        <rect x={18} y={10} width={4} height={2} />
      </g>
      <g fill="var(--cyan)">
        <rect x={11} y={13} width={2} height={3} />
        <rect x={16} y={13} width={2} height={3} />
      </g>
    </svg>
  );
}

export default Saucer;
