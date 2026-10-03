import { useState } from "react";
import { Link } from "react-router-dom";
import type { Short } from "../api/types";
import { docTitleParts } from "../lib/docTitle";
import { useAutoplayInView } from "../lib/useAutoplayInView";

// Horizontal row (or, with `grid`, a wrapping grid) of 9:16 Short cards
// (muted, looping, playing while on screen).
export function ShortsRow({ shorts, loading = false, grid = false, href }: { shorts: Short[]; loading?: boolean; grid?: boolean; href: (s: Short) => string }) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  useAutoplayInView(row, [shorts]);
  return (
    <div ref={setRow} data-scroll aria-busy={loading} className={grid ? "grid grid-cols-3 gap-[10px] min-[900px]:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" : "flex snap-x snap-mandatory gap-[10px] overflow-x-auto pb-1.5"}>
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
            <div key={i} aria-hidden="true" className="aspect-[9/16] w-[132px] shrink-0 rounded-[14px] border border-line bg-surface" />
          ))
        : shorts.map((s) => {
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
