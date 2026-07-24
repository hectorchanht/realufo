// Cold Case detail screen — ported from realufo-handoff/RealUFO.dc.html
// lines 289-307: coord line, name H1, archive label + status, lede, an
// optional pull-quote blockquote, and an optional "ACTIVE DISCUSSION" card
// linking to the case's related board thread.
//
// This component renders ONLY the screen content — AppShell (Task 14) owns
// the app frame/AppBar/nav and mounts this inside its `<Outlet/>`, same as
// every other screen task.
import { Link, useParams } from "react-router-dom";
import { useCase } from "../api/queries";

export function Case() {
  const { slug = "" } = useParams();
  const { data, isLoading } = useCase(slug);

  const caseDetail = data?.case;
  const relatedThread = data?.relatedThread ?? null;

  if (isLoading) {
    return (
      <div data-screen="case" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }

  if (!caseDetail) {
    return (
      <div data-screen="case" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
        case not found.
      </div>
    );
  }

  return (
    <div data-screen="case" style={{ animation: "fadeup .3s ease both" }}>
      {/* coord line — prototype line 291 */}
      <div className="mb-3 font-mono text-[10px]" style={{ color: caseDetail.accent, letterSpacing: ".4px" }}>
        {caseDetail.coord}
      </div>

      {/* name — prototype line 292 */}
      <h1 className="mb-[6px] text-[27px] font-bold leading-[1.12] text-ink" style={{ letterSpacing: "-.01em" }}>
        {caseDetail.name}
      </h1>

      {/* archive label + status — prototype line 293 */}
      <div className="mb-[18px] font-mono text-[10px] uppercase text-faint" style={{ letterSpacing: ".5px" }}>
        {caseDetail.archive_label}
        {caseDetail.status && (
          <>
            {" · "}
            <span className="text-amber">{caseDetail.status}</span>
          </>
        )}
      </div>

      {/* lede — prototype line 294 */}
      <p className="mb-[22px] text-[15px] leading-[1.65] text-dim">{caseDetail.lede}</p>

      {/* pull-quote blockquote — prototype lines 295-299 */}
      {caseDetail.pull && (
        <blockquote
          className="mb-[22px] rounded-r-xl bg-surface px-[18px] py-4"
          style={{ borderLeft: `3px solid ${caseDetail.accent}` }}
        >
          <div className="text-base italic leading-[1.55] text-ink">“{caseDetail.pull}”</div>
          <div className="mt-[11px] font-mono text-[10px] text-faint" style={{ letterSpacing: ".3px" }}>
            {caseDetail.pull_cite}
          </div>
        </blockquote>
      )}

      {/* "ACTIVE DISCUSSION" card — prototype lines 301-306 */}
      {relatedThread && (
        <Link
          to={`/thread/${relatedThread.id}`}
          className="flex items-center gap-3 rounded-2xl border border-line2 bg-surface p-[14px] text-left"
        >
          <span
            aria-hidden="true"
            className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[10px] text-[17px]"
            style={{ background: "var(--signal-dim)", color: "var(--signal)" }}
          >
            💬
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[9.5px] text-faint">ACTIVE DISCUSSION · {relatedThread.boardSlug}</div>
            <div
              className="mt-[3px] text-[13px] font-semibold text-ink"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {relatedThread.title}
            </div>
          </div>
          <span aria-hidden="true" className="flex-none text-faint">
            ›
          </span>
        </Link>
      )}
    </div>
  );
}

export default Case;
