// Cold cases index: one card per hand-written case page (/case/:slug).
// Data comes from bootstrap's `cases[]` (name, accent, coord, short lede).
import { Link } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { Skeleton } from "../components/Skeleton";

export default function Cases() {
  useSetPageTitle("COLD CASES", "Famous cases and the files behind them");
  const { data: boot, isLoading } = useBootstrap();
  const cases = boot?.cases ?? [];

  return (
    <div data-screen="cases" className="flex flex-col gap-2.5">
      {isLoading && !boot ? (
        <Skeleton rows={6} h={64} />
      ) : (
        cases.map((c) => (
          <Link
            key={c.slug}
            to={`/case/${c.slug}`}
            style={{ borderLeftColor: c.accent }}
            className="rounded-[14px] border border-line border-l-4 bg-surface px-[14px] py-3 hover:border-line2"
          >
            <div className="text-[15px] font-bold text-ink">{c.name}</div>
            <div className="font-mono text-[10px] text-faint">{c.coord}</div>
            {c.lede && <div className="mt-1 text-[13px] text-dim">{c.lede}</div>}
          </Link>
        ))
      )}
    </div>
  );
}
