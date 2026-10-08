// /leaderboard — the WTF leaderboard: records ranked by "unexplained" verdict
// votes in a trailing window. The Worker pre-renders the month view for
// crawlers (worker/lib/pages.ts leaderboardPage); the SPA takes over for the
// week/month tabs here.
import { useState } from "react";
import { Trophy } from "lucide-react";
import { useRecords } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { useLang } from "../lib/lang";
import { DocCard } from "../components/DocCard";
import { Skeleton } from "../components/Skeleton";
import { LoadError } from "../components/LoadError";

type Win = "week" | "month";

const TABS: Win[] = ["week", "month"];

export default function Leaderboard() {
  const { t } = useLang();
  const [win, setWin] = useState<Win>("month");
  const { data, error, isLoading, isPlaceholderData, refetch } = useRecords(
    { sort: win === "week" ? "wtf_week" : "wtf_month", limit: 30 },
    { keepPrevious: true },
  );
  useSetPageTitle("LEADERBOARD", t("leaderboard.subtitle"));

  const records = data?.records ?? [];

  return (
    <div data-screen="leaderboard" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="flex items-center gap-2 font-mono text-[15px] font-bold text-ink">
        <Trophy size={15} className="text-signal" />
        {t("leaderboard.title").toUpperCase()}
      </h1>
      <p className="mb-4 mt-1 text-[13.5px] leading-[1.6] text-dim">{t("leaderboard.subtitle")}</p>

      {/* window tabs */}
      <div className="mb-4 flex gap-1.5" role="tablist" aria-label={t("leaderboard.title")}>
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={win === k}
            onClick={() => setWin(k)}
            className={`rounded-lg border px-3 py-[5px] font-mono text-[11px] outline-none transition ${
              win === k ? "text-ink" : "hover:text-ink"
            }`}
            style={{
              borderColor: win === k ? "var(--signal)" : "var(--line2)",
              color: win === k ? "var(--ink)" : "var(--dim)",
              background: win === k ? "color-mix(in srgb, var(--signal) 12%, transparent)" : "transparent",
            }}
          >
            {t(`leaderboard.${k}`)}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <Skeleton rows={6} h={120} />
      ) : !data ? (
        <LoadError error={error} onRetry={() => void refetch()} />
      ) : records.length === 0 ? (
        <div className="px-5 py-[60px] text-center font-mono text-[12px] leading-[1.8] text-faint">
          {t("leaderboard.emptyLine1")}
          <br />
          {t("leaderboard.emptyLine2")}
        </div>
      ) : (
        <div
          data-grid
          className={`transition-opacity ${isPlaceholderData ? "opacity-50" : ""} grid grid-flow-row-dense grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]`}
        >
          {records.map((record, i) => (
            <div key={record.id} className="relative">
              <span
                className="absolute -left-1 -top-1 z-10 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold"
                style={{ background: "var(--signal)", color: "#000" }}
                aria-label={`rank ${i + 1}`}
              >
                #{i + 1}
              </span>
              <DocCard record={record} variant="grid" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
