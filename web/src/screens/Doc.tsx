// Document detail screen — the core discussion surface. Ported from
// realufo-handoff/RealUFO.dc.html lines 346-388: swipeable media panel with
// prev/next (pointer-swipe handlers `docDown`/`docUp`/`swipeDoc`, lines
// 520-522), agency/archive chips, a 2x2 meta grid (incident/location/
// released/VIRIN), summary, "OPEN ORIGINAL", a Discussion header + count,
// "Add your read on this file…", the comment list (vote + "⤴ to a board"
// promote-to-thread), and "◈ Start a board thread about this file" (composer
// wiring per lines 629-632).
//
// Swipe / prev-next list derivation: the prototype swipes through
// `view.list || this._orderedIds()` — the SAME filtered/ordered id array the
// Archive screen browses (RealUFO.dc.html:522/526). Here that list is
// re-derived by reading the archive-filter query params (`q`/`archive`/
// `type`/`redacted` — the exact same names Archive.tsx's useSearchParams
// reads) off THIS route's own URL and calling `useRecords` with them: a
// caller that forwards its current filters when linking here (e.g.
// `/doc/:id?archive=nara`) keeps swiping inside that filtered set; with no
// forwarded params this resolves to the full unfiltered order (same as
// Archive with no filters applied) — the simplest correct approach the task
// brief calls out, and it needs no change to DocCard/Archive's own links.
// If the current id isn't found in that list (unknown list, or navigated
// here directly with a filter that excludes this record), `idx` is -1 and
// prev/next both come back disabled/no-op — the brief's explicit fallback.
//
// Loading/not-found: `record` is undefined both while `useRecord` hasn't
// settled and if the id doesn't resolve to a real record — both cases render
// the same simple safe states (no attempt to index into `undefined`).
import { useMemo, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useBootstrap, useComments, useRecord, useRecords } from "../api/queries";
import type { RecordsParams } from "../api/queries";
import type { RecordKind } from "../api/types";
import { VoteButton } from "../components/VoteButton";
import { useOverlay } from "../overlays/OverlayProvider";
import { useSetPageTitle } from "../lib/pageTitle";

// prototype line 522: `if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.4)`.
const SWIPE_MIN_DX = 55;
const SWIPE_DOMINANCE = 1.4;

// Default board a promoted comment / file-thread lands in — the prototype's
// `defBoard=(D.boards[0]&&D.boards[0].id)||'uap'` (RealUFO.dc.html:628);
// Composer.tsx itself already falls back to 'uap' when no boardId is given,
// so hard-coding it here (rather than resolving D.boards[0] via bootstrap)
// matches that same effective default without an extra bootstrap lookup.
const DEFAULT_BOARD = "uap";

// Prototype's `_short` (RealUFO.dc.html:530): record titles are seeded as
// "<ID>, <human title>" — strip that leading id prefix (only when the comma
// sits within the first ~34 chars, so a title with no such prefix, or a
// stray comma deep in the sentence, passes through untouched) and swap
// underscores for spaces.
function shortTitle(title: string): string {
  const t = title || "";
  const c = t.indexOf(",");
  const s = c > 0 && c < 34 ? t.slice(c + 1).trim() : t;
  return s.replace(/_/g, " ");
}

// Matches DocCard.tsx's local `typeGlyph` (kept duplicated rather than
// exported/shared — it's a 3-line pure function and the two screens don't
// otherwise share a module).
function typeGlyph(kind: RecordKind): string {
  if (kind === "video") return "VID";
  if (kind === "image") return "IMG";
  return "PDF";
}

// FRONTEND-CONTEXT.md "Stance colors" — same map StanceTag.tsx encodes as
// Tailwind classes, but the doc-comment author label (prototype line 377's
// `c.stanceColor`) colors bare "Anonymous" text rather than a StanceTag
// dot+label, so it needs the raw color value, not a class.
const STANCE_COLOR: Record<string, string> = {
  believer: "var(--grn)",
  skeptic: "var(--amber)",
  analyst: "var(--cyan)",
};
function stanceColor(stance: string | null): string {
  return (stance && STANCE_COLOR[stance]) || "var(--dim)";
}

interface MetaCellProps {
  label: string;
  value: string;
}

// One cell of the 2x2 meta grid (prototype lines 361-364).
function MetaCell({ label, value }: MetaCellProps) {
  return (
    <div className="bg-surface px-[13px] py-[11px]">
      <div className="font-mono text-[8.5px] uppercase tracking-[.6px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-xs text-ink" style={{ overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

export function Doc() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { openComposer, openViewer } = useOverlay();

  const { data: detail, isLoading } = useRecord(id);
  const { data: commentsData } = useComments(id);
  const { data: boot } = useBootstrap();

  // See file header note — same filter param names Archive.tsx reads off its
  // own URL, read here off THIS route's URL instead.
  const listParams: RecordsParams = {
    q: searchParams.get("q") || undefined,
    archive: searchParams.get("archive") || undefined,
    type: searchParams.get("type") || undefined,
    redacted: searchParams.get("redacted") === "1" || undefined,
  };
  const { data: listData } = useRecords(listParams);
  const ids = useMemo(() => (listData?.records ?? []).map((r) => r.id), [listData]);
  const idx = ids.indexOf(id);
  const prevOk = idx > 0;
  const nextOk = idx >= 0 && idx < ids.length - 1;
  const docIdx = idx >= 0 ? `${idx + 1} / ${ids.length}` : "";
  const restSearch = searchParams.toString();

  // prototype line 522's `swipeDoc`: wrap-around vibrates and does not move;
  // otherwise navigates to the neighbor id, preserving the forwarded filter
  // query string so continued swiping/prev-next stays inside the same list.
  function goTo(dir: 1 | -1) {
    const ni = idx + dir;
    if (idx < 0 || ni < 0 || ni >= ids.length) {
      navigator.vibrate?.(12);
      return;
    }
    navigate(`/doc/${ids[ni]}${restSearch ? `?${restSearch}` : ""}`);
    navigator.vibrate?.(4);
  }

  // prototype lines 520-521 (`docDown`/`docUp`), ported with a ref instead of
  // instance fields so a re-render mid-gesture never loses the start point.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      goTo(dx < 0 ? 1 : -1);
    }
  }

  const record = detail?.record;
  const comments = commentsData?.comments ?? [];
  const promotedThreads = detail?.promotedThreads ?? [];

  // AppBar title — prototype's doc branch (RealUFO.dc.html:568):
  // `ht=(r&&r.agency)||'FILE'; hs=r?this._short(r.title):''`. Called
  // unconditionally (before the loading/not-found returns below) so hook
  // order never varies; while `record` hasn't loaded yet, the same "FILE"
  // fallback the prototype uses for its own undefined-record case is fine.
  useSetPageTitle(record?.agency || "FILE", record ? shortTitle(record.title) : "");

  if (isLoading) {
    return (
      <div data-screen="doc" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }

  if (!record) {
    return (
      <div data-screen="doc" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
        file not found.
      </div>
    );
  }

  const archive = boot?.archives.find((a) => a.id === record.archive);
  const accent = archive?.accent ?? "var(--signal)";
  const archiveLabel = archive?.label ?? record.archive;
  const title = shortTitle(record.title);
  const isVideo = record.kind === "video";
  const glyph = typeGlyph(record.kind);
  const thumbUrl = detail?.assets.find((a) => a.role === "thumb")?.cdn_url ?? null;
  const fullUrl =
    detail?.assets.find((a) => a.role === "full")?.cdn_url ??
    detail?.assets.find((a) => a.role === "original")?.cdn_url ??
    thumbUrl ??
    "";
  const badge = record.agency || "DOC";
  const location = record.location && record.location !== "N/A" ? record.location : "";

  function handleOpenOriginal() {
    if (!fullUrl) return;
    if (isVideo) {
      openViewer({ kind: "video", url: fullUrl, label: title });
      return;
    }
    // PDFs/docs open in a new tab rather than the in-app <iframe> overlay:
    // a cross-origin PDF (served from assets.realufo.org) renders blank inside
    // an iframe on many browsers — mobile Safari/Chrome especially, and the
    // Cloudflare/headless renderer — so hand the file to the browser's native
    // PDF handling instead. (The overlay's own "open source" link did the same.)
    window.open(fullUrl, "_blank", "noopener,noreferrer");
  }

  function handleAddComment() {
    openComposer({ mode: "comment", recordId: id });
  }

  // The "⤴ to a board" promote flow (prototype lines 631-632's `onPromote`).
  function handlePromote(commentBody: string) {
    openComposer({
      mode: "newThread",
      sourceRecordId: id,
      presetTitle: title,
      presetBody: `Pulling this out of the file discussion:\n\n“${commentBody}”\n\nWorth its own thread?`,
      boardId: DEFAULT_BOARD,
    });
  }

  // "◈ Start a board thread about this file" (prototype line 630's
  // `onFileThread`) — same file reference, empty body, and (per the task
  // brief) a `refLabel` so Composer's "REFERENCING FILE" chip shows the file.
  function handleFileThread() {
    openComposer({
      mode: "newThread",
      sourceRecordId: id,
      presetTitle: title,
      refLabel: title,
      boardId: DEFAULT_BOARD,
    });
  }

  return (
    <div data-screen="doc" className="pb-5" style={{ animation: "fadeup .28s ease both" }}>
      {/* media panel — prototype lines 348-357 */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="relative mb-3.5 overflow-hidden rounded-2xl border border-line2 bg-bg2"
        style={{ aspectRatio: "4/3", touchAction: "pan-y" }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover"
            style={{ filter: "contrast(1.05) saturate(.92)" }}
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center"
            style={{
              background:
                "repeating-linear-gradient(45deg,var(--bg2),var(--bg2) 12px,var(--surface) 12px,var(--surface) 24px)",
            }}
          >
            <span
              className="rounded-[9px] border-2 px-4 py-2 font-mono text-base font-bold"
              style={{ color: accent, borderColor: accent }}
            >
              {glyph}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={handleOpenOriginal}
          aria-label={`open ${glyph}`}
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.45), transparent 45%)" }}
        >
          {isVideo && (
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 grid h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white text-[22px] text-white"
              style={{ background: "rgba(0,0,0,.55)" }}
            >
              ▶
            </span>
          )}
          <span
            aria-hidden="true"
            className="absolute bottom-[11px] right-3 rounded-[7px] px-[9px] py-1 font-mono text-[10px] text-white"
            style={{ background: "rgba(0,0,0,.6)" }}
          >
            ⛶ open {glyph}
          </span>
        </button>
        <span
          className="absolute left-[10px] top-[10px] rounded-md px-2 py-1 font-mono text-[9px] font-bold"
          style={{ background: "rgba(0,0,0,.72)", color: accent }}
        >
          {badge}
        </span>
        {!!record.redacted && (
          <span className="absolute right-[10px] top-[10px] rounded-md bg-red px-2 py-1 font-mono text-[9px] font-bold text-white">
            REDACTED
          </span>
        )}
        {docIdx && (
          <span
            className="absolute left-1/2 top-[11px] -translate-x-1/2 rounded-full px-[9px] py-[3px] font-mono text-[9px] text-white"
            style={{ background: "rgba(0,0,0,.55)" }}
          >
            {docIdx}
          </span>
        )}
        {prevOk && (
          <button
            type="button"
            onClick={() => goTo(-1)}
            aria-label="Previous file"
            className="absolute left-2 top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full border border-white/25 text-[19px] text-white active:scale-90"
            style={{ background: "rgba(0,0,0,.5)" }}
          >
            ‹
          </button>
        )}
        {nextOk && (
          <button
            type="button"
            onClick={() => goTo(1)}
            aria-label="Next file"
            className="absolute right-2 top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full border border-white/25 text-[19px] text-white active:scale-90"
            style={{ background: "rgba(0,0,0,.5)" }}
          >
            ›
          </button>
        )}
      </div>

      {/* chips row — prototype line 358 */}
      <div className="mb-[10px] flex flex-wrap gap-[7px]">
        <span
          className="rounded-[7px] border border-line2 px-[9px] py-1 font-mono text-[10px]"
          style={{ color: accent }}
        >
          {record.agency_full || record.agency}
        </span>
        <span className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim">
          {archiveLabel}
        </span>
      </div>

      {/* title — prototype line 359 */}
      <h1 className="mb-3.5 text-[19px] font-bold leading-[1.3] text-ink" style={{ overflowWrap: "anywhere" }}>
        {title}
      </h1>

      {/* meta grid — prototype lines 360-365 */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <MetaCell label="Incident" value={record.incident_date || ""} />
        <MetaCell label="Location" value={location} />
        <MetaCell label="Released" value={record.doc_date || ""} />
        <MetaCell label="VIRIN" value={record.virin || ""} />
      </div>

      {/* summary — prototype line 366 */}
      <p className="mb-4 text-[14.5px] leading-[1.65] text-dim">{record.summary || ""}</p>

      {/* OPEN ORIGINAL — prototype line 367 */}
      <button
        type="button"
        onClick={handleOpenOriginal}
        className="mb-[22px] w-full rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.99]"
      >
        ⛶ OPEN ORIGINAL {glyph}
      </button>

      {/* promotedThreads back-references — not in the prototype's doc markup
          (RealUFO.dc.html has no such strip), but required by the data model:
          GET /api/records/:id returns `promotedThreads[]`, the record->thread
          direction of the bidirectional "promote a comment to its own
          thread" link. Placed between the record's own info and the
          Discussion section below, since it bridges the two. */}
      {promotedThreads.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-[.6px] text-faint">◂ promoted threads</div>
          <div className="flex flex-wrap gap-2">
            {promotedThreads.map((pt) => (
              <Link
                key={pt.id}
                to={`/thread/${pt.id}`}
                className="rounded-lg border border-line2 px-[10px] py-[7px] font-mono text-[10.5px]"
                style={{ color: pt.accent }}
              >
                {pt.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Discussion header + count — prototype line 368 */}
      <div className="mb-3 flex items-baseline justify-between">
        <div className="font-pixel text-[9px] tracking-[1px] text-faint">◆ Discussion</div>
        <span className="font-mono text-[10px] text-signal">{comments.length} comments</span>
      </div>

      {/* "Add your read on this file…" — prototype lines 369-373 */}
      <button
        type="button"
        onClick={handleAddComment}
        className="mb-3.5 flex w-full items-center gap-[10px] rounded-xl border border-line2 bg-surface px-[14px] py-3 text-left active:scale-[.99]"
      >
        <span
          aria-hidden="true"
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full text-[13px]"
          style={{ background: "var(--signal-dim)", color: "var(--signal)" }}
        >
          ✎
        </span>
        <span className="flex-1 font-body text-[13.5px] text-faint">Add your read on this file…</span>
        <span className="flex-none font-mono text-[8.5px] tracking-[.5px] text-faint">ANON OK</span>
      </button>

      {/* comment list — prototype lines 374-385 */}
      <div className="flex flex-col gap-[10px]">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface p-[13px]">
            <div className="mb-[7px] flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-bold" style={{ color: stanceColor(c.stance) }}>
                Anonymous
              </span>
              {c.handleShow && <span className="font-mono text-[10px] text-cyan">{c.handleShow}</span>}
              <span className="font-mono text-[9px] text-faint">ID:{c.id}</span>
              <span className="ml-auto font-mono text-[9px] text-faint">{c.ago}</span>
            </div>
            <div className="text-[13px] leading-[1.55] text-ink" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {c.body}
            </div>
            <div className="mt-[9px] flex items-center gap-4">
              {/* Task 19 brief names VoteButton explicitly for this control —
                  the prototype's own comment-vote affordance (line 380) is a
                  bare unbordered "▲ N" button, visually different from
                  VoteButton's bordered pillar chrome used everywhere else
                  (threads); reusing the shared component here trades that
                  literal-pixel match for one consistent vote control + a
                  single source of the optimistic-vote behavior. */}
              <VoteButton targetType="comment" targetId={c.id} votes={c.votes} />
              <button
                type="button"
                onClick={() => handlePromote(c.body)}
                className="flex items-center gap-[5px] font-mono text-[11px] text-amber active:scale-[.93]"
              >
                <span aria-hidden="true" className="text-xs">
                  ⤴
                </span>
                to a board
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* "◈ Start a board thread about this file" — prototype line 386 */}
      <button
        type="button"
        onClick={handleFileThread}
        className="mt-4 flex w-full items-center justify-center gap-[9px] rounded-xl border border-dashed border-line2 py-[13px] font-mono text-xs font-semibold text-ink active:scale-[.98]"
      >
        ◈ Start a board thread about this file
      </button>
    </div>
  );
}

export default Doc;
