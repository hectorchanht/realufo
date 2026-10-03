// /browse — every hub (release, agency, location, decade) with its file count.
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import type { HubKind } from "../api/types";
import { useSetPageTitle } from "../lib/pageTitle";
import { KIND_PLURAL } from "./Hub";

const KINDS: HubKind[] = ["release", "agency", "location", "decade"];

export default function Browse() {
  const { data, isLoading } = useHubs();
  useSetPageTitle("BROWSE", "", "Browse the archive");
  if (isLoading) {
    return (
      <div data-screen="browse" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }
  const hubs = data?.hubs ?? [];
  return (
    <div data-screen="browse" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-4 text-[19px] font-bold leading-[1.3] text-ink">Browse the archive</h1>
      <Link to="/releases" className="mb-4 inline-block font-mono text-[11px] text-signal hover:underline">
        Release tracker: dates, schedule and next release →
      </Link>
      {KINDS.map((k) => {
        const group = hubs.filter((h) => h.kind === k);
        if (!group.length) return null;
        return (
          <section key={k} className="mb-5" aria-labelledby={`browse-${k}`}>
            <h2 id={`browse-${k}`} className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
              {KIND_PLURAL[k]}
            </h2>
            <div className="flex flex-wrap gap-[7px]">
              {group.map((h) => (
                <Link
                  key={h.slug}
                  to={`/${h.kind}/${h.slug}`}
                  className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim"
                >
                  {h.label} · {h.count}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
