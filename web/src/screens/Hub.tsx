// Hub landing page (spec 2026-10-02-realufo-hub-pages): every file for one
// release / agency / location / decade, with a data-written intro. The
// Worker pre-renders the same content for crawlers (worker/lib/ssr.ts hubBody).
// File lists paginate (48/page) via ?page=N, in step with the pre-render.
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useHub } from "../api/queries";
import type { HubHighlights, HubKind, ReleaseBlock, TopicBlock } from "../api/types";
import { Faq } from "../components/Faq";
import { FollowBell } from "../components/FollowBell";
import GoDeeper from "../components/GoDeeper";
import { picksForTopic } from "../../../worker/lib/affiliate";
import { docTitleParts } from "../lib/docTitle";
import { DocCard } from "../components/DocCard";
import { useSetPageTitle } from "../lib/pageTitle";
import { Skeleton } from "../components/Skeleton";
import { useEffect } from "react";

export const KIND_LABEL: Record<HubKind, string> = { release: "RELEASE", topic: "TOPIC", agency: "AGENCY", location: "LOCATION", decade: "DECADE" };
export const KIND_PLURAL: Record<HubKind, string> = { release: "RELEASES", topic: "TOPICS", agency: "AGENCIES", location: "LOCATIONS", decade: "DECADES" };

// Hub pages (agency / topic / release / location / decade) are text-led:
// breadcrumb, title, intro, a stands-out card, then the record grid. This
// skeleton mirrors that order, so the page doesn't flash the archive's bare
// DocCard grid while the hub data is in flight.
function HubSkeleton() {
  const box = "motion-safe:animate-pulse rounded bg-surface";
  return (
    <div role="status" aria-label="Loading" data-testid="hub-skeleton">
      <div data-skel="breadcrumb" aria-hidden="true" className={`mb-1 h-[12px] w-[140px] ${box}`} />
      <div data-skel="title" aria-hidden="true" className="mb-3 flex items-center gap-2">
        <div className={`h-[26px] flex-1 ${box}`} />
        <div className={`h-[26px] w-[26px] rounded-full ${box}`} />
      </div>
      <div data-skel="intro" aria-hidden="true" className="mb-5 flex flex-col gap-[8px]">
        <div className={`h-[15px] ${box}`} />
        <div className={`h-[15px] ${box}`} />
        <div className={`h-[15px] w-[70%] ${box}`} />
      </div>
      <div data-skel="card" aria-hidden="true" className="mb-5 rounded-xl border border-line p-3">
        <div className={`mb-2 h-[12px] w-[130px] ${box}`} />
        <div className={`mb-3 h-[15px] w-[92%] ${box}`} />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-lg p-1">
            <div className={`h-12 w-12 flex-none rounded-md ${box}`} />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-[6px]">
              <div className={`h-[13px] w-[80%] ${box}`} />
              <div className={`h-[12px] w-[95%] ${box}`} />
            </div>
          </div>
        ))}
      </div>
      <Skeleton cards rows={4} />
    </div>
  );
}

export default function Hub({ kind }: { kind: HubKind }) {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const { data, isLoading } = useHub(kind, slug, page);
  useSetPageTitle(KIND_LABEL[kind], data?.title ?? "", data?.title);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  if (isLoading) {
    return (
      <div data-screen="hub">
        <HubSkeleton />
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
      <div className="flex items-start gap-2">
        <h1 className="mb-2 min-w-0 flex-1 text-[19px] font-bold leading-[1.3] text-ink">{data.title}</h1>
        {(kind === "agency" || kind === "topic" || kind === "location") && <FollowBell kind="hub" id={`${kind}/${slug}`} />}
      </div>
      {data.topic && <TopicIntro t={data.topic} />}
      <p className="mb-4 text-[14.5px] leading-[1.65] text-dim">{data.intro}</p>
      {data.release && <WhatsNew b={data.release} />}
      {data.highlights && <Highlights h={data.highlights} />}
      {data.topic && <Stories t={data.topic} />}
      {data.release ? (
        <ReleaseNav b={data.release} />
      ) : (
        (data.prev || data.next) && (
          <div className="mb-4 flex justify-between font-mono text-xs text-ink">
            {data.prev ? <Link to={`/release/${data.prev}`}>← RELEASE {data.prev.padStart(2, "0")}</Link> : <span />}
            {data.next ? <Link to={`/release/${data.next}`}>RELEASE {data.next.padStart(2, "0")} →</Link> : <span />}
          </div>
        )
      )}
      <div className="mb-6 grid grid-flow-row-dense grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {data.records.map((r) => (
          <DocCard key={r.id} record={r} variant="grid" />
        ))}
      </div>
      {data.totalPages > 1 && (
        <nav aria-label="Pages" className="mb-6 flex items-center justify-center gap-4 font-mono text-[12px] text-dim">
          {data.page > 1 ? (
            <Link to={`?page=${data.page - 1}`} className="hover:text-signal">← Prev</Link>
          ) : (
            <span className="invisible">← Prev</span>
          )}
          <span>
            Page {data.page} of {data.totalPages} · {data.total} files
          </span>
          {data.page < data.totalPages ? (
            <Link to={`?page=${data.page + 1}`} className="hover:text-signal">Next →</Link>
          ) : (
            <span className="invisible">Next →</span>
          )}
        </nav>
      )}
      {data.release && <Faq items={data.release.faq} />}
      {kind === "topic" && <GoDeeper picks={picksForTopic(slug)} />}
      {data.siblings.length > 0 && (
        <section aria-labelledby="hub-more">
          <h2 id="hub-more" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
            MORE {KIND_PLURAL[kind]}
          </h2>
          <div data-scroll className="flex gap-[7px] overflow-x-auto pb-1 [&>*]:flex-none">
            {data.siblings.map((s) => (
              <Link
                key={s.slug}
                to={`/${s.kind}/${s.slug}`}
                className="tag"
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

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMon = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const pad2 = (n: number) => String(n).padStart(2, "0");

function WhatsNew({ b }: { b: ReleaseBlock }) {
  const fresh = b.info.newAgencies;
  return (
    <section aria-labelledby="hub-new" className="mb-5 rounded-xl border border-line p-3">
      <h2 id="hub-new" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
        WHAT'S NEW IN RELEASE {pad2(b.info.no)}
      </h2>
      <ul className="flex flex-col gap-1 text-[13.5px] leading-[1.55] text-dim">
        <li>{b.size}</li>
        <li className="flex flex-wrap gap-x-2">
          {b.info.agencies.map((g) =>
            g.slug ? (
              <Link key={g.label} to={`/agency/${g.slug}`} className="text-signal hover:underline">{g.label} {g.count}</Link>
            ) : (
              <span key={g.label}>{g.label} {g.count}</span>
            )
          )}
        </li>
        <li>{b.kinds}</li>
        {fresh.length > 0 && <li>First release with files from {fresh.length < 2 ? fresh[0] : `${fresh.slice(0, -1).join(", ")} and ${fresh[fresh.length - 1]}`}</li>}
      </ul>
    </section>
  );
}

function ReleaseNav({ b }: { b: ReleaseBlock }) {
  return (
    <div className="mb-4 flex flex-wrap justify-between gap-2 font-mono text-xs text-ink">
      {b.prev ? <Link to={`/release/${b.prev.no}`}>← RELEASE {pad2(b.prev.no)} ({dayMon(b.prev.date)})</Link> : <span />}
      <Link to="/releases" className="text-faint hover:text-signal">ALL RELEASES</Link>
      {b.next ? (
        <Link to={`/release/${b.next.no}`}>RELEASE {pad2(b.next.no)} ({dayMon(b.next.date)}) →</Link>
      ) : b.upcoming ? (
        <Link to="/releases" className="text-signal">{b.upcoming} →</Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function TopicIntro({ t }: { t: TopicBlock }) {
  return (
    <div className="mb-4">
      {t.background.split(/\n+/).filter((p) => p.trim()).map((p, i) => (
        <p key={i} className="mb-2 text-[14.5px] leading-[1.65] text-ink">{p}</p>
      ))}
      {t.lore && (
        <p className="mb-2 text-[13.5px] leading-[1.6] text-dim">
          <span className="font-semibold text-amber">Where the lore differs:</span> {t.lore}
        </p>
      )}
      {t.sources.length > 0 && (
        <section aria-labelledby="topic-sources" className="mb-2">
          <h2 id="topic-sources" className="mb-1 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">SOURCES IN THE ARCHIVE</h2>
          <ul className="flex flex-col gap-1 text-[13px] leading-[1.5] text-dim">
            {t.sources.map((s) => (
              <li key={`${s.id}-${s.page}`}>
                <Link to={`/doc/${encodeURIComponent(s.id)}${s.page ? `?p=${s.page}` : ""}`} className="text-signal hover:underline">
                  {s.title}{s.page ? ` — p. ${s.page}` : ""}
                </Link>
                : {s.note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stories({ t }: { t: TopicBlock }) {
  const items = t.stories;
  if (!items.length) return null;
  return (
    <section aria-labelledby="topic-stories" className="mb-5">
      <h2 id="topic-stories" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">RELATED STORIES</h2>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={s.slug}>
            <Link to={s.href} className="text-[13.5px] text-signal hover:underline">{s.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
