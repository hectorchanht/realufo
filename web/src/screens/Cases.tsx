// Cold cases index: one card per hand-written case page (/case/:slug).
// Data comes from bootstrap's `cases[]` (name, accent, coord, short lede).
import { Link } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { useLang } from "../lib/lang";
import { Skeleton } from "../components/Skeleton";

export default function Cases() {
  const { lang, t } = useLang();
  useSetPageTitle(t("nav.cases").toUpperCase(), t("cases.sub"));
  const { data: boot, isLoading } = useBootstrap();
  const zh = lang === "zh-Hant";
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
            <div className="text-[15px] font-bold text-ink">{zh && c.name_zh ? c.name_zh : c.name}</div>
            <div className="font-mono text-[10px] text-faint">{c.coord}</div>
            {c.lede && <div className="mt-1 text-[13px] text-dim">{c.lede}</div>}
          </Link>
        ))
      )}
    </div>
  );
}
