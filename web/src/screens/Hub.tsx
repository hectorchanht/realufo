// Hub landing page (spec 2026-10-02-realufo-hub-pages): every file for one
// release / agency / location / decade, with a data-written intro. The
// Worker pre-renders the same content for crawlers (worker/lib/ssr.ts hubBody).
import { Link, useParams } from "react-router-dom";
import { useHub } from "../api/queries";
import type { HubHighlights, HubKind } from "../api/types";
import { docTitleParts } from "../lib/docTitle";
import { DocCard } from "../components/DocCard";
import { useSetPageTitle } from "../lib/pageTitle";

export const KIND_LABEL: Record<HubKind, string> = { release: "RELEASE", agency: "AGENCY", location: "LOCATION", decade: "DECADE" };
export const KIND_PLURAL: Record<HubKind, string> = { release: "RELEASES", agency: "AGENCIES", location: "LOCATIONS", decade: "DECADES" };

export default function Hub({ kind }: { kind: HubKind }) {
  const { slug = "" } = useParams();
  const { data, isLoading } = useHub(kind, slug);
  useSetPageTitle(KIND_LABEL[kind], data?.title ?? "", data?.title);

  if (isLoading) {
    return (
      <div data-screen="hub" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }
  if (!data) {
    return (
      <div data-screen="hub" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
        hub not found.
      </div>
    );
  }
  return (
    <div data-screen="hub" style={{ animation: "fadeup .3s ease both" }}>
      <div className="mb-1 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        <Link to="/browse" className="hover:text-signal">BROWSE</Link> › {KIND_PLURAL[kind]}
      </div>
      <h1 className="mb-2 text-[19px] font-bold leading-[1.3] text-ink">{data.title}</h1>
      <p className="mb-4 text-[14.5px] leading-[1.65] text-dim">{data.intro}</p>
      {data.highlights && <Highlights h={data.highlights} />}
      {(data.prev || data.next) && (
        <div className="mb-4 flex justify-between font-mono text-xs text-ink">
          {data.prev ? <Link to={`/release/${data.prev}`}>← RELEASE {data.prev.padStart(2, "0")}</Link> : <span />}
          {data.next ? <Link to={`/release/${data.next}`}>RELEASE {data.next.padStart(2, "0")} →</Link> : <span />}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {data.records.map((r) => (
          <DocCard key={r.id} record={r} variant="grid" />
        ))}
      </div>
      {data.siblings.length > 0 && (
        <section aria-labelledby="hub-more">
          <h2 id="hub-more" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
            MORE {KIND_PLURAL[kind]}
          </h2>
          <div className="flex flex-wrap gap-[7px]">
            {data.siblings.map((s) => (
              <Link
                key={s.slug}
                to={`/${s.kind}/${s.slug}`}
                className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim"
              >
                {s.label} · {s.count}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Highlights({ h }: { h: HubHighlights }) {
  return (
    <section aria-labelledby="hub-highlights" className="mb-5 rounded-xl border border-line p-3">
      <h2 id="hub-highlights" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
        WHAT STANDS OUT
      </h2>
      <p className="mb-3 text-[14px] leading-[1.6] text-dim">{h.lede}</p>
      <ol className="flex flex-col gap-2">
        {h.picks.map((p) => {
          const t = docTitleParts(p.id, p.title, p.kind);
          return (
            <li key={p.id}>
              <Link to={`/doc/${encodeURIComponent(p.id)}`} className="flex gap-3 rounded-lg p-1 hover:bg-line">
                {p.thumb ? (
                  <img src={p.thumb} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-md object-cover" />
                ) : (
                  <div className="h-12 w-12 flex-none rounded-md border border-line" />
                )}
                <div className="min-w-0">
                  <div className="line-clamp-1 text-[13px] font-semibold text-ink">{t.title}</div>
                  <div className="text-[12.5px] leading-[1.45] text-dim">{p.why}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 font-mono text-[9.5px] text-faint">AI-written from the file summaries</div>
    </section>
  );
}
