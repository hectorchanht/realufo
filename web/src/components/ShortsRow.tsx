import { useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { Short } from "../api/types";
import { docTitleParts } from "../lib/docTitle";
import { useAutoplayInView } from "../lib/useAutoplayInView";

// Loading placeholders for Short cards: 9:16 `.skel` shimmer tiles with a
// play glyph + label bars, so a loading row reads as *clips loading* — the
// old flat pulse boxes read as blank dark cards (2026-10-18 scrutiny, where
// the homepage Short clips row sat blank for ~5s). Also used standalone by
// the Archive's Shorts view, whose loading shape is this grid, not DocCards.
export function ShortsSkeleton({ grid = false, count = 4 }: { grid?: boolean; count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      aria-busy="true"
      className={grid ? "grid grid-cols-3 gap-[10px] min-[900px]:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" : "flex snap-x snap-mandatory gap-[10px] overflow-x-auto pb-1.5"}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`skel relative aspect-[9/16] overflow-hidden rounded-[14px] border border-line ${grid ? "" : "w-[132px] shrink-0 snap-start"}`}
        >
          <span className="absolute inset-0 grid place-items-center text-dim opacity-90">
            <span className="grid place-items-center rounded-full border border-line bg-surface2/70 p-2.5">
              <Play size={22} aria-hidden="true" />
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 space-y-1.5 px-2 pb-2">
            <span className="block h-2 w-1/3 rounded bg-surface2" />
            <span className="block h-2.5 w-4/5 rounded bg-surface2" />
          </span>
        </div>
      ))}
    </div>
  );
}

// Horizontal row (or, with `grid`, a wrapping grid) of 9:16 Short cards
// (muted, looping, playing while on screen).
export function ShortsRow({ shorts, loading = false, grid = false, href }: { shorts: Short[]; loading?: boolean; grid?: boolean; href: (s: Short) => string }) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  useAutoplayInView(row, [shorts]);
  if (loading) return <ShortsSkeleton grid={grid} count={grid ? 6 : 4} />;
  return (
    <div ref={setRow} data-scroll className={grid ? "grid grid-cols-3 gap-[10px] min-[900px]:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" : "flex snap-x snap-mandatory gap-[10px] overflow-x-auto pb-1.5"}>
      {shorts.map((s) => {
        const t = docTitleParts(s.id, s.title, "video");
        return (
          <Link
            key={s.id}
            to={href(s)}
            aria-label={t.title}
            className={`relative aspect-[9/16] overflow-hidden rounded-[14px] border border-line bg-bg2 ${grid ? "" : "w-[132px] shrink-0 snap-start"}`}
          >
            <video src={s.clip} poster={s.thumb ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className="h-full w-full object-cover" />
            {/* Grid cards say what they are (the row's cards stay bare). */}
            {grid && (
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-8 text-white">
                <span className="block truncate font-mono text-[8.5px] uppercase tracking-[.6px] text-white/60">{t.id}</span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-[1.25]">{t.title}</span>
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export const shortHref = (s: Short, q = "") => `/shorts/${encodeURIComponent(s.id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
