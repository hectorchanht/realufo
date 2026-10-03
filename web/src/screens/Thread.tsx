// Thread view screen — posts + reply. Ported from
// realufo-handoff/RealUFO.dc.html lines 258-287 (post list + sticky "Post a
// reply" bar) and the post view-model at lines 605-611 (image handling: a
// post's `source_record_id` renders a 96px thumb of the referenced record;
// an `image_kind==='placeholder'` post renders a hatched tile carrying
// `image_label`).
//
// This component renders ONLY the screen content — AppShell (Task 14) owns
// the app frame/AppBar/nav and mounts this inside its `<Outlet/>`, same as
// every other screen task.
//
// The "◂ from record" source back-reference chip: FRONTEND-CONTEXT.md names
// `sourceRecord` as the thread-side half of the record<->thread bidirectional
// link (Doc.tsx's file header covers the record-side half, its
// `promotedThreads[]` strip). The prototype's thread markup (lines 258-287)
// has no such chip of its own, but the data model requires surfacing it here
// — styled as a compact bordered chip, consistent with Doc.tsx's own
// promotedThreads row rather than inventing a new visual language.
//
// Post image resolution: GET /api/threads/:id (worker/routes/threads.ts's
// getThread) enriches only ONE record onto the payload — `sourceRecord`,
// resolved from the THREAD's own `source_record_id`. A `Post` itself carries
// only the opaque `source_record_id` id, no thumb/kind of its own. In this
// app every post whose `source_record_id` is set was written by
// createThread's OP-post insert (threads.ts binds the thread's
// `source_record_id` onto the OP post row too; Composer.tsx's reply flow
// never sends `source_record_id` at all — only `image_label` for the
// placeholder-image checkbox), so a post's `source_record_id` always equals
// `thread.source_record_id` in practice, and `sourceRecord` is the only (and
// sufficient) record data this endpoint gives us to render that post's
// thumb. Guarded defensively below (`post.source_record_id ===
// sourceRecord?.id`) rather than assumed, so an unmatched id degrades to "no
// image" instead of a wrong thumb.
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { RecordEmbed } from "../components/RecordEmbed";
import { MOMENT_SUFFIX, RECORD_ID_RE, parseMoment } from "../lib/recordMedia";
import { QUOTE_SOURCE, backlinks } from "../lib/quoteLinks";
import { useThread } from "../api/queries";
import type { Post, ThreadSourceRecord } from "../api/types";
import { VoteButton } from "../components/VoteButton";
import { LoadError } from "../components/LoadError";
import { useOverlay } from "../overlays/OverlayProvider";
import { docPageTitle, docTitleParts } from "../lib/docTitle";
import { useSetPageTitle } from "../lib/pageTitle";

// Matches Doc.tsx's own local STANCE_COLOR/stanceColor (FRONTEND-CONTEXT.md
// "Stance colors") — kept duplicated for the same reason Doc.tsx gives for
// its local `typeGlyph`: a tiny pure function, and the two screens don't
// otherwise share a module.
const STANCE_COLOR: Record<string, string> = {
  believer: "var(--grn)",
  skeptic: "var(--amber)",
  analyst: "var(--cyan)",
};
function stanceColor(stance: string | null): string {
  return (stance && STANCE_COLOR[stance]) || "var(--dim)";
}

type PostImage =
  | { kind: "record"; recordKind: string; thumb: string | null; label: string }
  | { kind: "upload"; url: string; label: string }
  | { kind: "placeholder"; label: string };

// See file header note on why `sourceRecord` is the only record data
// available for a post's thumb, and why the id-match guard is defensive
// rather than assumed.
function postImage(post: Post, sourceRecord: ThreadSourceRecord | null): PostImage | null {
  // The poster's own image wins; the record stays reachable via the "◂ from record" chip.
  if (post.image_url) {
    return { kind: "upload", url: post.image_url, label: "attached image" };
  }
  if (post.source_record_id && sourceRecord && post.source_record_id === sourceRecord.id) {
    return { kind: "record", recordKind: sourceRecord.kind, thumb: sourceRecord.thumb, label: docTitleParts(sourceRecord.id, sourceRecord.title, sourceRecord.kind).title };
  }
  if (post.image_kind === "placeholder") {
    return { kind: "placeholder", label: post.image_label || "image" };
  }
  return null;
}

// Post body text with http(s) URLs turned into external links and each record
// id ("NASA-UAP-D030", or a moment "DOW-UAP-PR133@1:23.04") into a
// RecordEmbed. realufo.org/doc/<id> URLs (Ask-shared threads) also become a
// RecordEmbed. Media shows once per id (first mention). URLs match first, so
// an id inside another URL stays part of the link. ">>24420082" quote links
// (group 4) scroll to that post when it's in this thread, else stay plain text.
const BODY_TOKEN_RE = new RegExp(
  `(https?://[^\\s<>"]+)|(${RECORD_ID_RE.source})(?:${MOMENT_SUFFIX})?|${QUOTE_SOURCE}`,
  "g",
);

function scrollToPost(no: number | string) {
  document.getElementById(`p${no}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function linkifyBody(body: string, nos: Set<number>): ReactNode[] {
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of body.matchAll(BODY_TOKEN_RE)) {
    out.push(body.slice(last, m.index));
    let tok = m[0];
    if (m[1]) {
      tok = tok.replace(/[.,;:!?)\]'"]+$/, ""); // trailing sentence punctuation isn't part of the URL
      const doc = /^https?:\/\/(?:www\.)?realufo\.org\/doc\/([^/?#\s]+)(?:\?([^#\s]*))?/.exec(tok);
      let docId: string | null = null;
      try {
        if (doc) docId = decodeURIComponent(doc[1]);
      } catch {
        /* malformed escape: fall back to a plain link */
      }
      if (doc && docId) {
        const t = parseMoment(new URLSearchParams(doc[2] ?? "").get("t")) ?? undefined;
        out.push(<RecordEmbed key={m.index} id={docId} t={t} withMedia={!seen.has(docId)} />);
        seen.add(docId);
      } else {
        out.push(
          <a key={m.index} href={tok} target="_blank" rel="nofollow ugc noopener noreferrer" className="text-cyan underline">
            {tok}
          </a>,
        );
      }
    } else if (m[4]) {
      if (nos.has(Number(m[4]))) {
        const n = m[4];
        out.push(
          <a
            key={m.index}
            href={`#p${n}`}
            className="text-cyan"
            onClick={(e) => {
              e.preventDefault();
              scrollToPost(n);
            }}
          >
            &gt;&gt;{n}
          </a>,
        );
      } else out.push(m[0]);
    } else {
      const id = m[2];
      out.push(<RecordEmbed key={m.index} id={id} t={parseMoment(m[3]) ?? undefined} withMedia={!seen.has(id)} />);
      seen.add(id);
    }
    last = m.index + tok.length;
  }
  out.push(body.slice(last));
  return out;
}

interface PostRowProps {
  post: Post;
  sourceRecord: ThreadSourceRecord | null;
  /** Set on the OP row only: the OP *is* the thread, so it votes the thread's
   * counter (the one board rows show) instead of its own post row. */
  thread?: { id: string; votes: number };
  /** Nos of every post in this thread (">>N" only links when N is here). */
  nos: Set<number>;
  /** Nos of posts that quote this one. */
  replies: number[];
  onQuote: (no: number) => void;
}

// One post row — prototype lines 264-280.
function PostRow({ post, sourceRecord, thread, nos, replies, onQuote }: PostRowProps) {
  const { openViewer } = useOverlay();
  const img = postImage(post, sourceRecord);

  function handleOpenImage() {
    if (!img) return;
    if (img.kind === "record") {
      openViewer({ kind: img.recordKind === "video" ? "video" : "doc", url: img.thumb ?? undefined, label: img.label });
    } else if (img.kind === "upload") {
      openViewer({ kind: "image", url: img.url, label: img.label });
    } else {
      openViewer({ kind: "placeholder", label: img.label });
    }
  }

  return (
    <div
      data-post
      id={`p${post.no}`}
      className="rounded-[14px] border px-[14px] py-[13px]"
      style={{
        borderColor: post.isOp ? "var(--line2)" : "var(--line)",
        background: post.isOp ? "var(--surface2)" : "var(--surface)",
      }}
    >
      {/* meta row — prototype lines 265-271 */}
      <div className="mb-[9px] flex flex-wrap items-center gap-2">
        {(post.isOp || post.byOp) && (
          <span className="rounded-[5px] bg-signal px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#04140c]">
            OP
          </span>
        )}
        {post.handleShow && <span className="font-mono text-[10px] text-cyan">{post.handleShow}</span>}
        <span
          role="img"
          aria-label={post.stance ?? "neutral"}
          title={post.stance ?? "neutral"}
          className="text-[12px] leading-none"
          style={{ color: stanceColor(post.stance) }}
        >
          ●
        </span>
        <span className="font-mono text-[9px] text-faint">ID:{post.id}</span>
        <span className="ml-auto font-mono text-[9px] text-faint">
          {post.ago} · No.{post.no}
        </span>
      </div>

      {/* post image — prototype lines 272-274 / view-model lines 605-611 */}
      {img && (
        <button
          type="button"
          onClick={handleOpenImage}
          aria-label={`open ${img.label}`}
          data-post-image
          className="relative float-left mb-2 mr-3 h-24 w-24 flex-none overflow-hidden rounded-[10px] border border-line2 bg-bg2 active:scale-[.96]"
        >
          {img.kind === "upload" || (img.kind === "record" && img.thumb) ? (
            <img src={img.kind === "upload" ? img.url : img.thumb!} alt="" className="h-full w-full object-cover" />
          ) : (
            <div
              className="grid h-full w-full place-items-center px-1.5 text-center font-mono text-[9px]"
              style={{
                background:
                  "repeating-linear-gradient(45deg,var(--bg2),var(--bg2) 8px,var(--surface) 8px,var(--surface) 16px)",
                color: "var(--signal)",
              }}
            >
              {img.kind === "placeholder" ? img.label : "🖼"}
            </div>
          )}
        </button>
      )}

      {/* body — prototype line 275 */}
      <div
        className="text-[13.5px] leading-[1.55] text-ink"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {linkifyBody(post.body, nos)}
      </div>

      {/* footer — VoteButton("credible") + "↩ reply" (opens the composer quoting this post) */}
      <div className="mt-[10px] flex items-center gap-4 font-mono text-[11px]" style={{ clear: "both" }}>
        {thread ? (
          <VoteButton targetType="thread" targetId={thread.id} votes={thread.votes} />
        ) : (
          <VoteButton targetType="post" targetId={post.id} votes={post.votes} />
        )}
        <span className="text-dim">credible</span>
        <button type="button" onClick={() => onQuote(post.no)} className="text-dim hover:text-signal">
          ↩ reply
        </button>
      </div>
      {replies.length > 0 && (
        <div className="mt-2 font-mono text-[10px] text-faint">
          ↳{" "}
          {replies.map((n) => (
            <a
              key={n}
              href={`#p${n}`}
              onClick={(e) => {
                e.preventDefault();
                scrollToPost(n);
              }}
              className="mr-2 text-cyan"
            >
              &gt;&gt;{n}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Thread() {
  const { id = "" } = useParams();
  const { openComposer } = useOverlay();
  const { data, isLoading, error, refetch } = useThread(id);

  const thread = data?.thread;
  const sourceRecord = data?.sourceRecord ?? null;
  const posts = data?.posts ?? [];

  // AppBar title — prototype's thread branch (RealUFO.dc.html:569): called
  // unconditionally (before the loading/not-found returns below) so hook
  // order never varies; the "THREAD" fallback matches the old path-based
  // default while `thread` hasn't loaded yet.
  useSetPageTitle(thread?.boardSlug || "THREAD", thread?.title || "");

  if (isLoading) {
    return (
      <div data-screen="thread" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }

  if (!thread) {
    return (
      <div data-screen="thread">
        <LoadError error={error} onRetry={() => void refetch()} notFound="thread not found." />
      </div>
    );
  }

  function handleReply() {
    openComposer({ mode: "reply", threadId: id });
  }

  const nos = new Set(posts.map((p) => p.no));
  const replyMap = backlinks(posts);
  function handleQuote(no: number) {
    openComposer({ mode: "reply", threadId: id, presetBody: `>>${no}\n` });
  }

  return (
    <div data-screen="thread" className="pb-16" style={{ animation: "fadeup .3s ease both" }}>
      {/* header — prototype lines 260-261 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-[9.5px] font-bold" style={{ color: thread.accent }}>
          {thread.boardSlug}
        </span>
        <span className="font-mono text-[9px] text-faint">No.{thread.no}</span>
      </div>
      <h2 className="mb-4 text-[18px] font-bold leading-[1.28] text-ink">{thread.title}</h2>

      {/* "◂ from record" source back-reference chip — see file header note. */}
      {sourceRecord && (
        <Link
          to={`/doc/${sourceRecord.id}`}
          data-source-chip
          className="mb-4 flex items-center gap-[10px] rounded-[10px] border border-line2 bg-surface px-3 py-[9px]"
        >
          <span aria-hidden="true" className="flex-none text-sm text-faint">
            ◂
          </span>
          {sourceRecord.thumb && (
            <img src={sourceRecord.thumb} alt="" className="h-8 w-8 flex-none rounded-md object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[8.5px] uppercase tracking-[.5px] text-faint">
              from record · {sourceRecord.agency}
            </div>
            <div className="truncate text-xs text-ink">{docPageTitle(sourceRecord.id, sourceRecord.title, sourceRecord.kind)}</div>
          </div>
        </Link>
      )}

      {data?.sourceCase && (
        <Link
          to={`/case/${data.sourceCase.slug}`}
          data-case-chip
          className="mb-4 flex items-center gap-[10px] rounded-[10px] border border-line2 bg-surface px-3 py-[9px]"
        >
          <span aria-hidden="true" className="flex-none text-sm text-faint">
            ◂
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[8.5px] uppercase tracking-[.5px] text-faint">from cold case</div>
            <div className="truncate text-xs text-ink">{data.sourceCase.name}</div>
          </div>
        </Link>
      )}

      {/* post list — prototype lines 262-282 (OP-first ordering from the API) */}
      <div className="flex flex-col gap-[11px]">
        {posts.map((p) => (
          <PostRow
            key={p.id}
            post={p}
            sourceRecord={sourceRecord}
            thread={p.isOp ? thread : undefined}
            nos={nos}
            replies={replyMap.get(p.no) ?? []}
            onQuote={handleQuote}
          />
        ))}
      </div>

      {/* sticky bottom reply bar — prototype lines 284-286. Sits above the
          mobile BottomTab overlay via --bnav-y (AppShell; 0 when it's hidden). */}
      <div
        className="sticky left-0 right-0 z-20 -mx-4 mt-4 border-t border-line px-4 py-[10px] transition-[bottom] duration-300 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none"
        style={{
          bottom: "var(--bnav-y, 0px)",
          background: "color-mix(in srgb, var(--bg) 82%, transparent)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <button
          type="button"
          onClick={handleReply}
          className="flex w-full items-center gap-[10px] rounded-xl border border-line2 bg-surface px-[14px] py-[11px] text-left font-mono text-xs text-dim active:scale-[.99]"
        >
          <span className="text-[15px] text-signal">✎</span>
          Post a reply — anonymous by default
        </button>
      </div>
    </div>
  );
}

export default Thread;
