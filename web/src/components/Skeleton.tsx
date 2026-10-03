// Placeholder boxes while a screen's first fetch is in flight (the Feed's
// pattern): they reserve roughly the space the content will take, so nothing
// jumps when it lands, and never show raw "loading…" text, which reads as broken.
// `cards` = DocCard-shaped boxes in the standard card grid; otherwise a column
// of `h`-px rows (thread/board rows, a doc body…).
export function Skeleton({ rows = 4, h = 72, cards = false }: { rows?: number; h?: number; cards?: boolean }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cards ? "grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]" : "flex flex-col gap-[10px]"}
    >
      {Array.from({ length: rows }, (_, i) =>
        cards ? (
          <div key={i} aria-hidden="true" className="overflow-hidden rounded-[15px] border border-line bg-surface motion-safe:animate-pulse">
            <div className="aspect-[4/3] border-b border-line bg-bg2" />
            <div className="h-[100px]" />
          </div>
        ) : (
          <div key={i} aria-hidden="true" style={{ height: h }} className="rounded-[14px] border border-line bg-surface motion-safe:animate-pulse" />
        ),
      )}
    </div>
  );
}
