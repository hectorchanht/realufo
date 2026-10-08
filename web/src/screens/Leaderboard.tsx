// /leaderboard — WTF Leaderboard: records ranked by unexplained-verdict
// ("WTF") votes, this week / this month. Data comes from the existing
// GET /api/records?sort=wtf_week|wtf_month, which also exposes `wtfCount`
// (unexplained votes inside the window) per row.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Trophy } from "lucide-react";
import { useRecords } from "../api/queries";
import { useLang } from "../lib/lang";
import { useSetPageTitle } from "../lib/pageTitle";
import { docTitleParts } from "../lib/docTitle";
import { Skeleton } from "../components/Skeleton";
import { LoadError } from "../components/LoadError";
import type { ListRecordCard } from "../api/types";

type Tab = "week" | "month";

function Row({ r, rank, max }: { r: ListRecordCard; rank: number; max: number }) {
  const votes = r.wtfCount ?? 0;
  const pct = max > 0 ? Math.round((votes / max) * 100) : 0;
  const tp = docTitleParts(r.id, r.title, r.kind);
  return (
    <Link
      to={`/doc/${encodeURIComponent(r.id)}`}
      className={`flex items-center gap-3 rounded-xl border p-2.5 transition hover:bg-panel ${
        rank <= 3 ? "border-signal" : "border-line"
      }`}
    >
      <span
        className={`w-8 flex-none text-center font-pixel text-[15px] ${rank <= 3 ? "text-signal" : "text-faint"}`}
        aria-label={`rank ${rank}`}
      >
        {rank}
      </span>
      <span className="h-14 w-14 flex-none overflow-hidden rounded-lg bg-panel">
        {r.thumb ? (
          <img src={r.thumb} alt="" loading="lazy" className="block h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-faint">
            <Trophy size={18} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-snug text-ink">{tp.title}</span>
        <span className="mt-0.5 block font-mono text-[10.5px] text-faint">{r.id}</span>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-panel" aria-hidden="true">
          <span className="block h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="flex-none text-right">
        <span className="block font-pixel text-[16px] text-ink">{votes}</span>
        <span className="block font-mono text-[9.5px] uppercase text-faint">wtf</span>
      </span>
    </Link>
  );
}

export default function Leaderboard() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("week");
  const sort = tab === "week" ? "wtf_week" : "wtf_month";
  const { data, isLoading, isError, error, refetch } = useRecords({ sort, limit: 100 });
  useSetPageTitle(t("leaderboard.title"), "", `${t("leaderboard.title")} · RealUFO`);

  const tabs: { id: Tab; label: string }[] = [
    { id: "week", label: t("leaderboard.week") },
    { id: "month", label: t("leaderboard.month") },
  ];
  const rows = (data?.records ?? []) as ListRecordCard[];
  const max = rows.reduce((m, r) => Math.max(m, r.wtfCount ?? 0), 0);

  return (
    <div data-screen="leaderboard" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-1 text-[19px] font-bold leading-[1.3] text-ink">{t("leaderboard.title")}</h1>
      <p className="mb-4 text-[13px] leading-[1.55] text-dim">{t("leaderboard.subtitle")}</p>

      {/* window tabs — horizontally scrollable strip, never wraps */}
      <div data-scroll className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            aria-pressed={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex-none rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              tab === tb.id ? "border-signal bg-signal text-black" : "border-line bg-panel text-dim hover:text-ink"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {isError && !data ? (
        <LoadError error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <Skeleton rows={8} h={76} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-line p-8 text-center">
          <Trophy size={28} className="mx-auto mb-3 text-faint" />
          <p className="text-[14px] font-medium text-ink">{t("leaderboard.emptyLine1")}</p>
          <p className="mt-1 font-mono text-[11px] text-faint">{t("leaderboard.emptyLine2")}</p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Row r={r} rank={i + 1} max={max} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
