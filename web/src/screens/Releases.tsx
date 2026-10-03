// /releases — the war.gov release series and a labelled next-release window
// (spec 2026-10-03-realufo-release-tracker-design). The Worker pre-renders the
// same data for crawlers (worker/lib/ssr.ts releasesBody).
import { Link } from "react-router-dom";
import { useReleases } from "../api/queries";
import { useSetPageTitle } from "../lib/pageTitle";
import { Faq } from "../components/Faq";
import { RELEASES_TITLE } from "../../../worker/lib/shared";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function Releases() {
  const { data, isLoading, isError } = useReleases();
  useSetPageTitle("RELEASES", "", RELEASES_TITLE);
  if (isError && !data) {
    return <div data-screen="releases" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">release data unavailable.</div>;
  }
  if (isLoading || !data) {
    return <div data-screen="releases" className="font-mono text-[11px] text-faint">◉ loading signal…</div>;
  }
  const total = data.series.reduce((n, r) => n + r.files, 0);
  return (
    <div data-screen="releases" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-3 text-[19px] font-bold leading-[1.3] text-ink">{RELEASES_TITLE}</h1>
      <div className="mb-4 rounded-xl border border-signal p-3">
        <p className="text-[14.5px] font-semibold leading-[1.55] text-ink">{data.status.headline}</p>
        {data.status.basis && <p className="mt-1 text-[12.5px] leading-[1.5] text-dim">{data.status.basis}</p>}
      </div>
      <div className="mb-4 font-mono text-[10.5px] text-faint">
        {data.series.length} RELEASES · {total} FILES{data.window ? ` · MEDIAN GAP ${data.window.medianGap} DAYS` : ""}
      </div>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="font-mono text-[10px] text-faint">
              <th className="py-1 pr-3">RELEASE</th><th className="py-1 pr-3">DATE</th><th className="py-1 pr-3">FILES</th><th className="py-1 pr-3">GAP</th><th className="py-1">AGENCIES</th>
            </tr>
          </thead>
          <tbody>
            {[...data.series].reverse().map((r) => (
              <tr key={r.no} className="border-t border-line">
                <td className="py-1.5 pr-3"><Link to={`/release/${r.no}`} className="text-signal hover:underline">Release {pad2(r.no)}</Link></td>
                <td className="py-1.5 pr-3 text-dim">{r.weekday.slice(0, 3)} {r.date}</td>
                <td className="py-1.5 pr-3 text-ink">{r.files}</td>
                <td className="py-1.5 pr-3 text-dim">{r.gap ?? "—"}</td>
                <td className="py-1.5 text-dim">{r.agencies.slice(0, 3).map((a) => a.label).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Faq items={data.faq} />
    </div>
  );
}
