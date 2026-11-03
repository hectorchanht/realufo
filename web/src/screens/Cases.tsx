// Cold cases index: one card per hand-written case page (/case/:slug).
// Data comes from bootstrap's `cases[]` (name, accent, coord, short lede).
// The case accent tints the coord stamp (like BoardRow's slug), via dataInk
// so it still reads on the light theme.
import { Link } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { useLang } from "../lib/lang";
import { dataInk } from "../lib/dataInk";
import { Skeleton } from "../components/Skeleton";
import { LoadError } from "../components/LoadError";

export default function Cases() {
  const { lang, t } = useLang();
  useSetPageTitle(t("nav.cases").toUpperCase(), t("cases.sub"));
  const { data: boot, isLoading, error, refetch } = useBootstrap();
  const zh = lang === "zh-Hant";
  const cases = boot?.cases ?? [];

  if (isLoading && !boot) return <Skeleton rows={6} h={120} />;
  if (!boot) return <LoadError error={error} onRetry={() => void refetch()} />;

  return (
    <div data-screen="cases" className="grid gap-2 min-[900px]:grid-cols-2 min-[900px]:gap-3">
      {cases.map((c) => (
        <Link
          key={c.slug}
          to={`/case/${c.slug}`}
          className="rounded-[14px] border border-line bg-surface p-4 hover:border-line2 active:scale-[.99]"
        >
          <div className="text-[15px] font-bold text-ink">{zh && c.name_zh ? c.name_zh : c.name}</div>
          <div className="mt-1 font-mono text-[10px] leading-[1.4]" style={{ color: dataInk(c.accent) }}>
            {c.coord}
          </div>
          {c.lede && <div className="mt-2 text-[13px] leading-[1.5] text-dim">{c.lede}</div>}
        </Link>
      ))}
    </div>
  );
}
