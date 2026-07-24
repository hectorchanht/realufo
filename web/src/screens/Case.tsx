// Cold Case detail screen — ported from realufo-handoff/RealUFO.dc.html
// lines 289-307: coord line, name H1, archive label + status, lede, an
// optional pull-quote blockquote, and an optional "ACTIVE DISCUSSION" card
// linking to the case's related board thread.
//
// This component renders ONLY the screen content — AppShell (Task 14) owns
// the app frame/AppBar/nav and mounts this inside its `<Outlet/>`, same as
// every other screen task.
import { Link, useParams } from "react-router-dom";
import { useCase, useCaseComments } from "../api/queries";
import { useOverlay } from "../overlays/OverlayProvider";
import { VoteButton } from "../components/VoteButton";
import { useSetPageTitle } from "../lib/pageTitle";
import type { Stance } from "../api/types";

const DEFAULT_CASE_BOARD = "cases";

// Author stance colours (same map Doc/Thread use).
function stanceColor(stance: Stance | null | undefined): string {
  switch (stance) {
    case "believer":
      return "var(--grn)";
    case "skeptic":
      return "var(--amber)";
    case "analyst":
      return "var(--cyan)";
    default:
      return "var(--dim)";
  }
}

export function Case() {
  const { slug = "" } = useParams();
  const { data, isLoading } = useCase(slug);
  const { data: commentsData } = useCaseComments(slug);
  const { openComposer } = useOverlay();

  const caseDetail = data?.case;
  const relatedThread = data?.relatedThread ?? null;
  const comments = commentsData?.comments ?? [];

  // AppBar title — prototype's case branch (RealUFO.dc.html:571):
  // `ht='COLD CASE'; hs=c?c.name:''`. Called unconditionally (before the
  // loading/not-found returns below) so hook order never varies.
  useSetPageTitle("COLD CASE", caseDetail?.name || "");

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

      {/* Discussion — cases are discussion surfaces like records (add a
          comment, vote, promote a comment to a board, or start a thread). */}
      <div className="mt-[22px] mb-3 flex items-baseline justify-between">
        <div className="font-pixel text-[9px] uppercase text-faint" style={{ letterSpacing: "1px" }}>
          ◆ Discussion
        </div>
        <span className="font-mono text-[10px] text-signal">{comments.length} comments</span>
      </div>

      <button
        type="button"
        onClick={() => openComposer({ mode: "comment", caseSlug: slug })}
        className="mb-3.5 flex w-full items-center gap-2.5 rounded-xl border border-line2 bg-surface px-3.5 py-3 text-left hover:border-signal active:scale-[.99]"
      >
        <span
          aria-hidden="true"
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full text-[13px]"
          style={{ background: "var(--signal-dim)", color: "var(--signal)" }}
        >
          ✎
        </span>
        <span className="flex-1 font-body text-[13.5px] text-faint">Add your read on this case…</span>
        <span className="flex-none font-mono text-[8.5px] uppercase text-faint" style={{ letterSpacing: ".5px" }}>
          ANON OK
        </span>
      </button>

      <div className="flex flex-col gap-2.5">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface px-[13px] py-3">
            <div className="mb-[7px] flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-bold" style={{ color: stanceColor(c.stance) }}>
                Anonymous
              </span>
              {c.handleShow && <span className="font-mono text-[10px] text-cyan">{c.handleShow}</span>}
              <span className="font-mono text-[9px] text-faint">ID:{c.id}</span>
              <span className="ml-auto font-mono text-[9px] text-faint">{c.ago}</span>
            </div>
            <div className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-ink">{c.body}</div>
            <div className="mt-2.5 flex items-center gap-4">
              <VoteButton targetType="comment" targetId={c.id} votes={c.votes} />
              <button
                type="button"
                onClick={() =>
                  openComposer({
                    mode: "newThread",
                    caseSlug: slug,
                    boardId: DEFAULT_CASE_BOARD,
                    presetTitle: caseDetail.name,
                    presetBody: `Pulling this out of the case discussion:\n\n“${c.body}”\n\nWorth its own thread?`,
                  })
                }
                className="flex items-center gap-1.5 font-mono text-[11px] text-amber active:scale-[.93]"
              >
                <span className="text-[12px]">⤴</span>to a board
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          openComposer({
            mode: "newThread",
            caseSlug: slug,
            boardId: DEFAULT_CASE_BOARD,
            presetTitle: caseDetail.name,
            refLabel: caseDetail.name,
          })
        }
        className="mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed border-line2 py-[13px] font-mono text-xs font-semibold text-ink hover:border-signal hover:text-signal active:scale-[.98]"
      >
        ◈ Start a board thread about this case
      </button>
    </div>
  );
}

export default Case;
