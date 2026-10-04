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
//     Here both variants render the same compact "R" chip, titled
//     "Redacted" so hover and screen readers still get the full word.
//   - Video play glyph (line 128, Feed-only in the prototype): dropped on
//     both variants — the duration chip already marks a video.
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
import { CalendarDays, MapPin } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useBootstrap } from "../api/queries";
import { docTitleParts } from "../lib/docTitle";
import { parseCrop, smallThumb } from "../lib/recordMedia";
import type { FeedRecordCard, ListRecordCard, RecordCard } from "../api/types";
import { dataInk } from "../lib/dataInk";

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

const known = (v: string | null | undefined) => (v && v !== "N/A" ? v : "");

// Place and date, each behind its own icon, so a date never reads as a place.
function placeAndDate(r: ListRecordCard): { place: string; date: string } {
  return { place: known(r.location), date: known(r.incident_date) || known(r.doc_date) };
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
  // portrait video (phone clip padded to 16:9): the thumb is already cropped tall, so the card spans two
  // grid rows (parents use grid-flow-row-dense) and the thumb grows to fill them, its own shape as the floor
  const crop = record.kind === "video" ? parseCrop(record.crop) : null;
  const tall = crop && crop.w < crop.h ? crop.w / crop.h : null;

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
        (isFeed ? "rounded-[15px]" : "rounded-[14px]") +
        (tall ? " row-span-2" : "")
      }
    >
      <div
        className={`relative overflow-hidden border-b border-line bg-bg2 ${tall ? "flex-1" : "aspect-[4/3]"}`}
        style={tall ? { aspectRatio: `${tall}` } : undefined}
      >
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
              style={{ color: dataInk(accentColor), borderColor: dataInk(accentColor) }}
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
          style={{ background: "rgba(0,0,0,.85)", color: accentColor }}
        >
          {badge}
        </span>
        {!!record.redacted && (
          <span
            title="Redacted"
            aria-label="Redacted"
            className="absolute right-2 top-2 rounded-[5px] bg-red px-1.5 py-1 font-mono text-[8px] font-bold text-white"
          >
            R
          </span>
        )}
        {record.kind === "video" && !!record.duration && (
          <span className="absolute bottom-2 right-2 rounded-[5px] px-1.5 py-1 font-mono text-[9px] font-bold text-white" style={{ background: "rgba(0,0,0,.72)" }}>
            {formatDuration(record.duration)}
          </span>
        )}
      </div>

      <div className={"flex flex-col gap-[7px] " + (tall ? "" : "flex-1 ") + (isFeed ? "px-3 pb-[13px] pt-[11px]" : "px-[11px] pb-3 pt-[10px]")}>
        {isFeed && (
          <div className="font-mono text-[9px] tracking-[.4px] text-faint">{metaLine(record)}</div>
        )}
        {tp.showId && (
          <div className="truncate font-mono text-[9.5px] font-semibold tracking-[.3px]" style={{ color: dataInk(accentColor) }}>
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
        {record.oneLiner && (
          <div className="line-clamp-2 text-[11.5px] italic leading-[1.35] text-dim">“{record.oneLiner}”</div>
        )}
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
          <div className="mt-auto flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-[9px] text-faint">
            {(() => {
              const { place, date } = placeAndDate(record);
              if (!place && !date) return <span>—</span>;
              return (
                <>
                  {place && (
                    <span className="inline-flex min-w-0 items-center gap-1" title="Location">
                      <MapPin size={10} aria-label="Location" className="flex-none" />
                      {place}
                    </span>
                  )}
                  {date && (
                    <span className="inline-flex items-center gap-1" title="Date">
                      <CalendarDays size={10} aria-label="Date" className="flex-none" />
                      {date}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </Link>
  );
}

export default DocCard;
