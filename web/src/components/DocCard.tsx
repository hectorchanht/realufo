// Document/record card. Reconciles the prototype's two near-duplicate card
// markups into one component driven by a `variant` prop:
//   variant="feed"  -> realufo-handoff/RealUFO.dc.html lines 121-136 (Hot right
//                      now grid on the Feed screen): 15px radius, comment count+
//                      commentN footer, a top "agency · archive" meta line.
//   variant="grid"  -> lines 189-202 (Archive screen's record grid): 14px
//                      radius, locOrDate footer, no meta line.
// (default "grid" — matches the brief's `variant?='grid'` signature.)
//
// Deliberate unifications away from the prototype (kept identical across
// both variants for one predictable component, called out here since a
// literal port would branch on variant for these too):
//   - REDACTED chip: the prototype shows literal text only on the Feed
//     card (line 127); the Archive card shows a plain "■" square (line 195).
//     Here both variants render the same text chip — simpler, and it's the
//     shape Task 15's test contract ("shows REDACTED only when
//     record.redacted") expects to find by text.
//   - Video play glyph (line 128, Feed-only in the prototype): rendered here
//     whenever `record.kind === 'video'`, regardless of variant.
//   - Per-archive accent color: the prototype colors the badge/type-glyph
//     with `this.accentOf(r.archive)`, resolved from the bootstrap archives
//     list (`D.archives`). RecordCard itself (`record.archive` is just an id
//     like "wargov") doesn't carry that color — GET /api/records and
//     /api/feed never join in `archives.accent` (see FRONTEND-CONTEXT.md's
//     RecordCard shapes) — so DocCard resolves it itself via `useBootstrap()`
//     (cached/shared across the app by TanStack Query, so this is cheap even
//     though every card calls it) and looks up
//     `archives.find(a => a.id === record.archive)?.accent`, falling back to
//     `var(--signal)` while bootstrap hasn't loaded yet or for an unknown
//     archive id.
import { useState } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { docTitleParts } from "../lib/docTitle";
import { smallThumb } from "../lib/recordMedia";
import type { FeedRecordCard, ListRecordCard, RecordCard } from "../api/types";

export type DocCardVariant = "feed" | "grid";

export interface DocCardProps {
  record: RecordCard;
  variant?: DocCardVariant;
  onOpen?: (id: string) => void;
  /** Query string forwarded to /doc/:id (Archive's filters + page) so Doc swipes the same list. */
  search?: string;
  /** Above-the-fold card: load its thumb eagerly at high priority (it's the LCP image). */
  priority?: boolean;
}

function isFeedRecord(r: RecordCard): r is FeedRecordCard {
  return "commentN" in r;
}

function isListRecord(r: RecordCard): r is ListRecordCard {
  return "location" in r;
}

function typeGlyph(kind: RecordCard["kind"]): string {
  if (kind === "video") return "VID";
  if (kind === "image") return "IMG";
  return "PDF";
}

/** 9.6 → "0:10", 3725 → "1:02:05". */
export function formatDuration(sec: number): string {
  const t = Math.round(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function metaLine(r: RecordCard): string {
  const agency = r.agency || "";
  const archive = r.archive.toUpperCase();
  return agency ? `${agency} · ${archive}` : archive;
}

function locOrDate(r: ListRecordCard): string {
  if (r.location && r.location !== "N/A") return r.location;
  return r.incident_date || r.doc_date || "—";
}

export function DocCard({ record, variant = "grid", onOpen, search, priority }: DocCardProps) {
  // 0 = try the 400px WebP srcset, 1 = it failed: plain JPEG, then the type glyph.
  const [imgFails, setImgFails] = useState(0);
  const { data: boot } = useBootstrap();
  const small = record.thumb ? smallThumb(record.thumb) : null;
  const showImg = !!record.thumb && imgFails < (small ? 2 : 1);
  // srcset splits on whitespace, and R2 keys can contain raw spaces.
  const srcSet =
    small && imgFails === 0 ? `${small.replace(/ /g, "%20")} 400w, ${record.thumb!.replace(/ /g, "%20")} 640w` : undefined;
  const badge = record.agency || "DOC";
  // see file header note — resolved from the shared bootstrap cache; falls
  // back to var(--signal) until bootstrap loads or for an unknown archive id.
  const accentColor = boot?.archives.find((a) => a.id === record.archive)?.accent ?? "var(--signal)";
  // Same title rule as the Doc page: id once as a kicker (unless it only respells the title).
  const tp = docTitleParts(record.id, record.title, record.kind);
  const isFeed = variant === "feed";

  function handleClick(e: MouseEvent) {
    if (onOpen) {
      e.preventDefault();
      onOpen(record.id);
    }
  }

  return (
    <Link
      to={`/doc/${record.id}${search ? `?${search}` : ""}`}
      onClick={handleClick}
      data-doc-card
      data-variant={variant}
      className={
        "flex flex-col overflow-hidden border border-line bg-surface text-left hover:border-line2 active:scale-[.985] " +
        (isFeed ? "rounded-[15px]" : "rounded-[14px]")
      }
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-line bg-bg2">
        {showImg ? (
          <img
            src={record.thumb ?? undefined}
            srcSet={srcSet}
            sizes={srcSet && "(min-width: 900px) 260px, 50vw"}
            alt=""
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            onError={() => setImgFails((n) => n + 1)}
            className="block h-full w-full object-cover"
            style={{ filter: "contrast(1.05) saturate(.92)" }}
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center"
            style={{
              background:
                "repeating-linear-gradient(45deg, var(--bg2), var(--bg2) 9px, var(--surface) 9px, var(--surface) 18px)",
            }}
          >
            <span
              className="rounded-[7px] border-2 px-2.5 py-1 font-mono text-[13px] font-bold"
              style={{ color: accentColor, borderColor: accentColor }}
            >
              {typeGlyph(record.kind)}
            </span>
          </div>
        )}
        {isFeed && showImg && (
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,.55), transparent 55%)" }}
          />
        )}
        <span
          className="absolute left-2 top-2 rounded-[5px] px-1.5 py-1 font-mono text-[8.5px] font-bold"
          style={{ background: "rgba(0,0,0,.72)", color: accentColor }}
        >
          {badge}
        </span>
        {!!record.redacted && (
          <span className="absolute right-2 top-2 rounded-[5px] bg-red px-1.5 py-1 font-mono text-[8px] font-bold text-white">
            REDACTED
          </span>
        )}
        {record.kind === "video" && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-white text-[14px] text-white"
            style={{ background: "rgba(0,0,0,.55)" }}
          >
            ▶
          </span>
        )}
        {record.kind === "video" && !!record.duration && (
          <span className="absolute bottom-2 right-2 rounded-[5px] px-1.5 py-1 font-mono text-[9px] font-bold text-white" style={{ background: "rgba(0,0,0,.72)" }}>
            {formatDuration(record.duration)}
          </span>
        )}
      </div>

      <div className={"flex flex-1 flex-col gap-[7px] " + (isFeed ? "px-3 pb-[13px] pt-[11px]" : "px-[11px] pb-3 pt-[10px]")}>
        {isFeed && (
          <div className="font-mono text-[9px] tracking-[.4px] text-faint">{metaLine(record)}</div>
        )}
        {tp.showId && (
          <div className="truncate font-mono text-[9.5px] font-semibold tracking-[.3px]" style={{ color: accentColor }}>
            {tp.id}
          </div>
        )}
        <div
          className={
            "line-clamp-3 font-semibold leading-[1.3] text-ink " + (isFeed ? "text-[13px]" : "text-[12.5px]")
          }
        >
          {tp.title}
        </div>
        {isFeed && isFeedRecord(record) && (
          <div className="mt-auto flex gap-3 pt-0.5 font-mono text-[10px] text-dim">
            <span>💬 {record.commentN}</span>
            <span>⚖ {record.verdictN ?? 0}</span>
          </div>
        )}
        {isListRecord(record) && record.match && (
          <div className="line-clamp-3 text-[11px] leading-[1.4] text-dim">
            <span className="mr-1 font-mono text-[9px] text-signal">p.{record.match.page}</span>
            {record.match.text}
          </div>
        )}
        {!isFeed && isListRecord(record) && (
          <div className="mt-auto flex flex-wrap gap-2 font-mono text-[9px] text-faint">
            <span>{locOrDate(record)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export default DocCard;
