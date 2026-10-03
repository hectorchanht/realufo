import { useState } from "react";
import { Link } from "react-router-dom";
import type { Short } from "../api/types";
import { docTitleParts } from "../lib/docTitle";
import { useAutoplayInView } from "../lib/useAutoplayInView";

// Horizontal row of 9:16 Short cards (muted, looping, playing while on screen).
export function ShortsRow({ shorts, loading = false, href }: { shorts: Short[]; loading?: boolean; href: (s: Short) => string }) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  useAutoplayInView(row, [shorts]);
  return (
    <div ref={setRow} data-scroll aria-busy={loading} className="flex snap-x snap-mandatory gap-[10px] overflow-x-auto pb-1.5">
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
            <div key={i} aria-hidden="true" className="aspect-[9/16] w-[132px] shrink-0 rounded-[14px] border border-line bg-surface" />
          ))
        : shorts.map((s) => (
            <Link
              key={s.id}
              to={href(s)}
              aria-label={docTitleParts(s.id, s.title, "video").title}
              className="aspect-[9/16] w-[132px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-line bg-bg2"
            >
              <video src={s.clip} poster={s.thumb ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className="h-full w-full object-cover" />
            </Link>
          ))}
    </div>
  );
}

export const shortHref = (s: Short, q = "") => `/shorts/${encodeURIComponent(s.id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
