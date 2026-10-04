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
// Archive with no filters applied). Archive's DocCards forward their whole
// query string, `page` included, so the list is that exact 40-record page;
// on its first/last item Doc fetches the neighbour page and prev/next cross
// into it (rewriting `page`), so swiping runs through the whole result set.
// If the current id isn't found in that list (unknown list, or navigated
// here directly with a filter that excludes this record), `idx` is -1 and
// prev/next both come back disabled/no-op — the brief's explicit fallback.
//
// Loading/not-found: `record` is undefined both while `useRecord` hasn't
// settled and if the id doesn't resolve to a real record — both cases render
// the same simple safe states (no attempt to index into `undefined`).
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useBootstrap, useComments, useRecord, useRecords } from "../api/queries";
import type { RecordsParams } from "../api/queries";
import type { Comment, RecordDetail, RecordKind, RelatedGroup } from "../api/types";
import { DocCard } from "../components/DocCard";
import { LoadError } from "../components/LoadError";
import { goBack } from "../components/navItems";
import { MediaRuler } from "../components/MediaRuler";
import { LENS_MAGS, MediaFilters, MediaToolbar, Minimap, TOOL_PARAMS, ZoomLens, adjustFilter, adjustFromParams, adjustToParams, grabImage } from "../components/ImageTools";
import type { ImageAdjust } from "../components/ImageTools";
import { KeyMoments, VideoLens, VideoTransport } from "../components/VideoTools";
import { Articles } from "../components/Articles";
import { VerdictBar } from "../components/VerdictBar";
import { FollowBell } from "../components/FollowBell";
import { TldrCard } from "../components/TldrCard";
import { parseAiMoments, parseKeyMoments } from "../lib/keyMoments";
import { UploadThumb } from "../components/UploadThumb";
import { VoteButton } from "../components/VoteButton";
import FullText from "../components/FullText";
import { useOverlay } from "../overlays/OverlayProvider";
import { useSetPageTitle } from "../lib/pageTitle";
import { docPageTitle, docTitleParts } from "../lib/docTitle";
import { useSetFooterLinks, type FooterLinks } from "../lib/footerLinks";
import { promoteCommentOpts } from "../lib/promoteComment";
import { useMediaQuery } from "../lib/useMediaQuery";
import { sourceLinks } from "../lib/sourceLinks";
import { formatMoment, parseMoment, recordMedia } from "../lib/recordMedia";
import { DEFAULT_VIEW, VIEW_PARAMS, viewFromParams, viewToParams, viewTransform } from "../lib/mediaView";
import { useZoomPan } from "../lib/useZoomPan";
import { RECORDS_PAGE_SIZE, recordsFilter, recordsPage } from "../lib/recordsPage";
import { Skeleton } from "../components/Skeleton";
import { dataInk } from "../lib/dataInk";
import { plural } from "../lib/plural";

// prototype line 522: `if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.4)`.
const SWIPE_MIN_DX = 55;
const SWIPE_DOMINANCE = 1.4;
const CHROME_IDLE_MS = 2500;

// Board a promoted comment / file thread lands in: footage (videos, images)
// on /vids/, documents on /gov/ (every archive is an official US release).
const fileBoard = (kind: string) => (kind === "video" || kind === "image" ? "vids" : "gov");

const RELATED_HEAD: Record<RelatedGroup["key"], string> = {
  media: "Related media",
  topic: "Same topic",
  location: "Same location",
  period: "Same period",
  release: "Same release",
  agency: "Same agency",
};

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
// `c.stanceColor`) colors a bare stance dot rather than a StanceTag
// dot+label, so it needs the raw color value, not a class.
const STANCE_COLOR: Record<string, string> = {
  believer: "var(--grn)",
  skeptic: "var(--amber)",
  analyst: "var(--cyan)",
};
function stanceColor(stance: string | null): string {
  return (stance && STANCE_COLOR[stance]) || "var(--dim)";
}

// "@1:23.04" / "1:23" in a comment → button that seeks the video there.
const MOMENT_IN_TEXT = /@?\b(\d{1,2}:\d{2}(?:\.\d{1,2})?)\b/g;
function withMoments(body: string, onSeek: (t: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of body.matchAll(MOMENT_IN_TEXT)) {
    const t = parseMoment(m[1]);
    if (t === null) continue;
    out.push(body.slice(last, m.index));
    out.push(
      <button key={m.index} type="button" onClick={() => onSeek(t)} className="font-mono text-signal underline underline-offset-2">
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  out.push(body.slice(last));
  return out;
}

interface MetaCellProps {
  label: string;
  value: string;
}

// One cell of the 2x2 meta grid (prototype lines 361-364). Hub links for these
// facts live in the site footer ("This file" column), not inline.
// Media panel cap: leaves room for the title above and the video tools bar below,
// which otherwise sat on the viewport's bottom edge like a detached mini-player.
const PANEL_MAX_H = "min(78vh, calc(100dvh - 280px))";

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

// The hub pages this file belongs to, for the footer's "This file" column.
function docFooterLinks(record: RecordDetail["record"], hubs: RecordDetail["hubs"], release: RecordDetail["release"], topics?: RecordDetail["topics"]): FooterLinks {
  const h = hubs ?? {};
  const links = [
    h.release && { to: `/release/${h.release}`, text: `More from Release ${String(release?.no ?? h.release).padStart(2, "0")}` },
    h.agency && { to: `/agency/${h.agency}`, text: `More from ${record.agency_full || record.agency}` },
    h.location && { to: `/location/${h.location}`, text: `More from ${record.location}` },
    h.decade && { to: `/decade/${h.decade}`, text: `More from the ${h.decade}` },
    ...(topics ?? []).map((t) => ({ to: `/topic/${t.slug}`, text: `More on ${t.label}` })),
  ].filter((l): l is { to: string; text: string } => !!l);
  return { title: "This file", links };
}

export function Doc() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openComposer, openViewer, composer, viewer, toast } = useOverlay();

  const { data: detail, isLoading, error, refetch } = useRecord(id);
  const { data: commentsData, error: commentsError, refetch: refetchComments } = useComments(id);
  const { data: boot } = useBootstrap();
  // Inline PDF <iframe> only on desktop — it renders blank on mobile browsers,
  // so mobile keeps the thumbnail + tap-to-open-in-new-tab flow.
  const isDesktop = useMediaQuery("(min-width: 900px)");

  // Fall back to the hatch placeholder if the thumbnail 404s / fails to load
  // (thumbs are generated best-effort, so a record may point at a not-yet-
  // uploaded key). Reset when navigating to another record.
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => setThumbFailed(false), [id]);

  // Image/video tools: adjust filters + zoom lens live in the URL (see
  // TOOL_PARAMS), so prev/next (docHref keeps the query) and series links
  // land on the next file with the same look; the frame view (zoom / pan /
  // rotate / flip) is per picture and starts clean on every file.
  // With a mouse the lens is on by default and click-through (follows the
  // pointer, media stays clickable); on touch it would block scrolling the
  // panel, so it stays an opt-in drag mode there. `lens=1|0` is written only
  // when it differs from that device default.
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const lensOf = (sp: URLSearchParams) => (sp.get("lens") === "1" ? true : sp.get("lens") === "0" ? false : finePointer);
  const magOf = (sp: URLSearchParams) => (LENS_MAGS.includes(Number(sp.get("mag"))) ? Number(sp.get("mag")) : 3);
  const adjust = useMemo(() => adjustFromParams(searchParams), [searchParams]);
  const lens = lensOf(searchParams);
  const mag = magOf(searchParams);
  // Latest params via a ref so back-to-back updates before a re-render
  // build on each other instead of on this render's params.
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;
  function tool<T>(read: (sp: URLSearchParams) => T, write: (sp: URLSearchParams, v: T) => void) {
    return (u: T | ((cur: T) => T)) => {
      const sp = new URLSearchParams(paramsRef.current);
      write(sp, typeof u === "function" ? (u as (cur: T) => T)(read(sp)) : u);
      paramsRef.current = sp;
      setSearchParams(sp, { replace: true }); // replace: slider drags don't flood history
    };
  }
  const setAdjust = tool<ImageAdjust>(adjustFromParams, adjustToParams);
  const setLens = tool<boolean>(lensOf, (sp, v) => (v === finePointer ? sp.delete("lens") : sp.set("lens", v ? "1" : "0")));
  const setMag = tool<number>(magOf, (sp, v) => (v === 3 ? sp.delete("mag") : sp.set("mag", String(v))));
  const [view, setView] = useState(DEFAULT_VIEW); // frame zoom / pan / rotate / flip
  const [compare, setCompare] = useState(false); // held: panel shows the file unfiltered
  const [ruler, setRuler] = useState(false);
  const [pic, setPic] = useState<{ w: number; h: number } | null>(null); // natural media size
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    setView(DEFAULT_VIEW);
    setPic(null);
    setRuler(false);
  }, [id]);
  const panelMedia = recordMedia(detail, isDesktop).media;
  // A transformed <video> would zoom/rotate its native controls too, so they
  // hide then (VideoTransport has its own seek bar).
  const transformed = view.z !== 1 || view.rot !== 0 || view.flip;
  const nativeControls = panelMedia === "video" && !transformed;
  const zoom = useZoomPan(panel, view, setView, panelMedia === "image" || panelMedia === "video" ? pic : null, {
    deadBottom: nativeControls ? 48 : 0,
    onShiftWheel: lens ? (d) => setMag((m) => LENS_MAGS[Math.min(LENS_MAGS.length - 1, Math.max(0, LENS_MAGS.indexOf(m) + d))]) : undefined,
  });
  // A shared view (?z=&cx=&cy=&rot=&flip=, see handleShare) applies once the
  // picture's size is known, then leaves the URL: the live view isn't synced
  // there, so a stale copy must not survive into reloads or prev/next.
  useEffect(() => {
    if (!pic || !panel) return;
    const sp = new URLSearchParams(paramsRef.current);
    if (!VIEW_PARAMS.some((k) => sp.has(k))) return;
    const r = panel.getBoundingClientRect();
    const v = viewFromParams(sp, { w: r.width, h: r.height }, pic);
    if (v) setView(v);
    for (const k of VIEW_PARAMS) sp.delete(k);
    paramsRef.current = sp;
    setSearchParams(sp, { replace: true });
  }, [pic, panel, setSearchParams]);
  const startAt = parseMoment(searchParams.get("t")) ?? undefined;
  // ?p=N: a PDF page, the document equivalent of ?t= (article evidence links use it).
  const pdfPage = Math.max(0, Math.floor(Number(searchParams.get("p")))) || undefined;
  const fileHref = `/api/file/${id}${pdfPage ? `#page=${pdfPage}` : ""}`;
  // VideoTransport portals its speed/loop chips into MediaToolbar's Adjust panel.
  const [speedSlot, setSpeedSlot] = useState<HTMLDivElement | null>(null);
  // Official time-coded "Video Description" lines → key moments (the rest stays as summary prose).
  const keyMoments = useMemo(() => parseKeyMoments(detail?.record.summary), [detail]);
  const aiMoments = useMemo(() => parseAiMoments(detail?.record.ai_moments), [detail]);

  // Panel chrome (badge, REDACTED, counter, arrows) fades out after a few
  // idle seconds so it never sits over the picture/video; any pointer
  // movement or tap on the panel brings it back, mouse-out hides it at once.
  const [chrome, setChrome] = useState(true);
  const chromeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function showChrome() {
    setChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setChrome(false), CHROME_IDLE_MS);
  }
  // data-lens-hide: also hidden while the lens bubble shows (index.css), so nothing sits over it
  const fade = `transition-opacity duration-300 ${chrome ? "" : "opacity-0"}`;
  useEffect(() => {
    showChrome();
    return () => clearTimeout(chromeTimer.current);
  }, [id]);

  // See file header note — same filter param names Archive.tsx reads off its
  // own URL, read here off THIS route's URL instead.
  const page = recordsPage(searchParams);
  const offset = (page - 1) * RECORDS_PAGE_SIZE;
  const listParams: RecordsParams = { ...recordsFilter(searchParams), limit: RECORDS_PAGE_SIZE };
  const { data: listData } = useRecords({ ...listParams, offset });
  const ids = useMemo(() => (listData?.records ?? []).map((r) => r.id), [listData]);
  const idx = ids.indexOf(id);
  const total = listData?.count ?? 0;
  // On the page's first/last item, fetch the neighbour page so prev/next can cross into it.
  const atFirst = idx === 0 && page > 1;
  const atLast = idx >= 0 && idx === ids.length - 1 && offset + ids.length < total;
  const { data: prevPage } = useRecords({ ...listParams, offset: offset - RECORDS_PAGE_SIZE }, { enabled: atFirst });
  const { data: nextPage } = useRecords({ ...listParams, offset: offset + RECORDS_PAGE_SIZE }, { enabled: atLast });

  // Neighbour href, keeping the forwarded filters and rewriting `page`.
  function docHref(target: string | undefined, targetPage: number): string | null {
    if (!target) return null;
    const sp = new URLSearchParams(searchParams);
    sp.delete("t"); // a moment belongs to this file, not the next
    sp.delete("p"); // so does a page
    for (const k of VIEW_PARAMS) sp.delete(k); // and a shared view
    if (targetPage > 1) sp.set("page", String(targetPage));
    else sp.delete("page");
    const qs = sp.toString();
    return `/doc/${target}${qs ? `?${qs}` : ""}`;
  }
  const prevHref =
    idx > 0 ? docHref(ids[idx - 1], page) : atFirst ? docHref(prevPage?.records.at(-1)?.id, page - 1) : null;
  const nextHref =
    idx >= 0 && idx < ids.length - 1 ? docHref(ids[idx + 1], page) : atLast ? docHref(nextPage?.records[0]?.id, page + 1) : null;
  const prevOk = !!prevHref;
  const nextOk = !!nextHref;
  const docIdx = idx >= 0 ? `${offset + idx + 1} / ${total}` : "";
  // Series links leave the list, so they keep only the media-tool params.
  const toolSp = new URLSearchParams([...searchParams].filter(([k]) => TOOL_PARAMS.includes(k)));
  const toolQuery = toolSp.size ? `?${toolSp}` : "";

  // prototype line 522's `swipeDoc`: wrap-around vibrates and does not move;
  // otherwise navigates to the neighbor id (see docHref).
  function goTo(dir: 1 | -1) {
    const href = dir === 1 ? nextHref : prevHref;
    if (!href) {
      navigator.vibrate?.(12);
      return;
    }
    navigate(href);
    navigator.vibrate?.(4);
  }

  // prototype lines 520-521 (`docDown`/`docUp`), ported with a ref instead of
  // instance fields so a re-render mid-gesture never loses the start point.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    showChrome();
    // Scrubbing a video/audio timeline must not count as a swipe.
    if ((e.target as HTMLElement).closest("video,audio")) return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }
  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || zoom.gestured.current || view.z > 1) return; // zoomed: drags pan instead
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_MIN_DX && Math.abs(dx) > Math.abs(dy) * SWIPE_DOMINANCE) {
      goTo(dx < 0 ? 1 : -1);
    }
  }

  // Keyboard nav while viewing a file: ← / → flip through the list, Esc leaves.
  // Ignored while an overlay is open (Esc closes it instead, see OverlayHost)
  // or while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (composer || viewer) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const href = e.key === "ArrowRight" ? nextHref : prevHref;
        if (!href) {
          navigator.vibrate?.(12);
          return;
        }
        navigate(href);
      } else if (e.key === "Escape") {
        goBack(navigate, `/doc/${id}`);
      } else if ((panelMedia === "image" || panelMedia === "video") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // media tool shortcuts (transport keys live in VideoTransport)
        const k = e.key.toLowerCase();
        const stepMag = (d: number) => setMag((m) => LENS_MAGS[Math.min(LENS_MAGS.length - 1, Math.max(0, LENS_MAGS.indexOf(m) + d))]);
        if (k === "l") setLens((x) => !x);
        else if (k === "=" || k === "+") stepMag(1);
        else if (k === "-") stepMag(-1);
        else if (k === "i") setAdjust((a) => ({ ...a, invert: !a.invert }));
        else if (k === "r") setView((v) => ({ ...DEFAULT_VIEW, flip: v.flip, rot: ((v.rot + 90) % 360) as typeof v.rot }));
        else if (k === "f") setView((v) => ({ ...v, flip: !v.flip }));
        else if (k === "0") setView((v) => ({ ...v, z: 1, x: 0, y: 0 }));
        else if (k === "\\") setCompare(true);
        else return;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => e.key === "\\" && setCompare(false);
    const release = () => setCompare(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [composer, viewer, prevHref, nextHref, navigate, id, panelMedia, setAdjust, setLens, setMag]);

  const record = detail?.record;
  const comments = commentsData?.comments ?? [];
  const promotedThreads = detail?.promotedThreads ?? [];

  // AppBar title is the record id (e.g. DOE-UAP-D004), subtitle the clean
  // title; when the id only respells the title (AARO-IMG-Go_Fast_UAP), the
  // title alone. Called unconditionally (before the loading/not-found returns
  // below) so hook order never varies; "FILE" while the record loads.
  // Tab title matches the worker's docTitle.
  const tp = record ? docTitleParts(record.id, record.title, record.kind) : null;
  useSetPageTitle(
    !tp ? "FILE" : tp.showId ? tp.id : tp.title,
    tp?.showId ? tp.title : "",
    tp ? (tp.showId ? `${tp.id} — ${tp.title}` : tp.title) : undefined,
  );
  useSetFooterLinks(record && detail ? docFooterLinks(record, detail.hubs, detail.release, detail.topics) : null);

  if (isLoading) {
    return (
      <div data-screen="doc">
        <Skeleton rows={3} h={180} />
      </div>
    );
  }

  if (!record) {
    return (
      <div data-screen="doc">
        <LoadError error={error} onRetry={() => void refetch()} notFound="file not found." />
      </div>
    );
  }

  const archive = boot?.archives.find((a) => a.id === record.archive);
  const accent = archive?.accent ?? "var(--signal)";
  const archiveLabel = archive?.label ?? record.archive;
  const title = tp!.title;
  const isVideo = record.kind === "video";
  const glyph = typeGlyph(record.kind);
  // crop: a phone clip padded to 16:9 shows as its own (vertical) picture, bars cut off
  const { media, fullUrl, thumbUrl, crop } = recordMedia(detail, isDesktop);
  const badge = record.agency || "DOC";
  const location = record.location && record.location !== "N/A" ? record.location : "";
  const srcLinks = sourceLinks(record, pdfPage);

  function handleOpenOriginal() {
    if (!fullUrl) return;
    if (isVideo) {
      openViewer({ kind: "video", url: fullUrl, label: title });
      return;
    }
    if (media === "image") {
      openViewer({ kind: "image", url: fullUrl, label: title, filter: adjustFilter(adjust), lensMag: lens ? mag : undefined });
      return;
    }
    // PDFs/docs open in a new tab via the SAME-ORIGIN inline route (worker
    // /api/file/:id sets Content-Disposition: inline). Opening the R2
    // cross-origin URL directly makes mobile browsers *download* the PDF
    // instead of viewing it; routing through our origin renders it inline in
    // the browser's PDF viewer. (An in-app <iframe> renders blank on mobile.)
    window.open(fileHref, "_blank", "noopener,noreferrer");
  }

  // Link to this file as seen: filters, lens, the zoomed/rotated view and (video) the moment.
  function handleShare(t?: number) {
    const sp = new URLSearchParams(toolSp);
    if (t !== undefined) sp.set("t", t.toFixed(2));
    if (pic && panel) {
      const r = panel.getBoundingClientRect();
      viewToParams(sp, view, { w: r.width, h: r.height }, pic);
    }
    const url = `${window.location.origin}/doc/${id}${sp.size ? `?${sp}` : ""}`;
    if (!navigator.clipboard) return toast(url);
    navigator.clipboard.writeText(url).then(
      () => toast(t !== undefined ? `Link to ${formatMoment(t)} copied` : "Link to this view copied"),
      () => toast(url),
    );
  }

  // Save the image as seen (filters, rotation, flip) from the same-origin route, so the canvas isn't tainted.
  async function saveView() {
    const blob = await grabImage(`/api/file/${id}`, adjustFilter(adjust), view);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  function handlePostFrame(frame: File, t: number) {
    openComposer({ mode: "comment", recordId: id, presetImage: frame, presetBody: `@${formatMoment(t)} ` });
  }

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    panel?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  function handleAddComment() {
    openComposer({ mode: "comment", recordId: id });
  }

  // The "⤴ to a board" promote flow (prototype lines 631-632's `onPromote`).
  function handlePromote(c: Comment) {
    openComposer(promoteCommentOpts(c, { title: docPageTitle(record!.id, record!.title, record!.kind), boardId: fileBoard(record!.kind), recordId: id }));
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
      boardId: fileBoard(record!.kind),
    });
  }

  // Desktop: title sits above the media (uapbrowser-style) and TopNav drops its copy;
  // mobile keeps it under the media, with the AppBar carrying the short title.
  const titleBlock = (
    <>
      {/* title — id prefix and underscores stripped; the id rides inside the h1 as a
          kicker (uapbrowser-style) so "DOW-UAP-D006" searches match the heading.
          Kicker only when the id isn't just the title respelled. */}
      <div className="flex items-start gap-2">
        <h1 className="mb-3.5 min-w-0 flex-1 text-[19px] font-bold leading-[1.3] text-ink" style={{ overflowWrap: "anywhere" }}>
          {tp!.showId && (
            <span className="mb-2 block font-pixel text-[10px] font-normal leading-normal" style={{ color: dataInk(accent) }}>
              {tp!.id}
              <span className="sr-only">, </span>
            </span>
          )}
          {title}
        </h1>
        <FollowBell kind="record" id={id} />
      </div>
    </>
  );

  const shownFilter = compare ? "" : adjustFilter(adjust); // the panel's look; viewer + saved frames keep the real one
  const shown = pic ?? crop; // crop known before metadata: panel takes its shape at once
  const panelRatio =
    shown && (media === "image" || media === "video") ? (view.rot % 180 ? shown.h / shown.w : shown.w / shown.h) : null;

  return (
    <div data-screen="doc" className="pb-5" style={{ animation: "fadeup .28s ease both" }}>
      {isDesktop && titleBlock}
      {/* media panel — prototype lines 348-357 */}
      <MediaFilters gamma={adjust.gamma} />
      <div
        ref={setPanel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={showChrome}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") {
            clearTimeout(chromeTimer.current);
            setChrome(false);
          }
        }}
        onFocus={showChrome}
        data-chrome={chrome ? "on" : "off"}
        // image letterbox is the panel's black, not the <img>'s, so filters (invert) don't recolor it.
        // select-none: a long-press while lensing must not start a text selection on the badges.
        className={`relative mb-3.5 select-none overflow-hidden rounded-2xl border border-line2 [&:fullscreen]:rounded-none [&:fullscreen]:border-0 ${media === "image" ? "bg-black" : "bg-bg2"}`}
        style={{
          // panel takes the media's own shape once known (turned with it at 90/270°), so it fills the
          // block with no letterbox bars; tall shapes narrow (centred) instead of being cut at 78vh
          aspectRatio: panelRatio ? `${panelRatio}` : "4/3",
          width: panelRatio ? `min(100%, calc(${PANEL_MAX_H} * ${panelRatio}))` : undefined,
          marginInline: "auto",
          maxHeight: PANEL_MAX_H,
          touchAction: view.z > 1 ? "none" : "pan-y",
          WebkitTouchCallout: "none",
        }}
      >
        {media === "image" && (
          <img
            ref={imgRef}
            src={fullUrl}
            alt={title}
            onLoad={(e) => setPic({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="h-full w-full object-contain"
            style={{ filter: shownFilter || undefined, transform: viewTransform(view, zoom.box, pic) || undefined }}
          />
        )}
        {media === "video" && (
          // filter on a wrapper, not the <video>: macOS Chrome hands an unoccluded playing video
          // to a hardware overlay that skips url() (SVG) filters, so palettes went flat navy
          // whenever the controls/chrome faded out.
          <div className="h-full w-full" style={{ filter: shownFilter || undefined }}>
            <video
              ref={videoRef}
              src={fullUrl}
              poster={thumbUrl ?? undefined}
              // native controls (big play button) fade with the panel chrome; tap brings them back.
              // Touch lens mode covers the panel, so they'd be unreachable — VideoTransport has play/seek.
              controls={nativeControls && chrome && (finePointer || !lens)}
              playsInline
              // browsers only allow autoplay when muted; the Mute chip / native controls unmute.
              // A ?t= link waits at its moment instead, with sound, for the visitor to press play.
              autoPlay={startAt === undefined}
              muted={startAt === undefined}
              onLoadedMetadata={(e) => setPic(crop ?? { w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })}
              // bars are centred (crawler/ingest/clips.bars), so cover on the crop-shaped panel cuts exactly them
              className={`h-full w-full bg-black ${crop ? "object-cover" : "object-contain"}`}
              style={{ transform: viewTransform(view, zoom.box, pic) || undefined }}
            />
          </div>
        )}
        {media === "pdf" && (
          <iframe title={title} src={fileHref} className="h-full w-full border-0 bg-white" />
        )}
        {(media === "thumb" || media === "audio") &&
          (thumbUrl && !thumbFailed ? (
            <img
              src={thumbUrl}
              alt=""
              onError={() => setThumbFailed(true)}
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
                style={{ color: dataInk(accent), borderColor: dataInk(accent) }}
              >
                {media === "audio" ? "AUD" : glyph}
              </span>
            </div>
          ))}
        {media === "audio" && (
          <audio src={fullUrl} controls preload="metadata" className="absolute bottom-3 left-3 right-3 w-[calc(100%-24px)]" />
        )}
        {/* tap-to-open overlay only where the panel isn't itself interactive */}
        {(media === "thumb" || (media === "image" && view.z === 1 && (!lens || finePointer))) && (
          <button
            type="button"
            // an image waits a beat so a double tap can zoom instead (a PDF opens a tab: no delay, or popup blockers bite)
            onClick={
              media === "image"
                ? () => {
                    const at = Date.now();
                    setTimeout(() => zoom.doubleAt.current < at && handleOpenOriginal(), 260);
                  }
                : handleOpenOriginal
            }
            data-tap-zoom
            aria-label={`open ${glyph}`}
            className="absolute inset-0"
            style={media === "thumb" ? { background: "linear-gradient(to top, rgba(0,0,0,.45), transparent 45%)" } : undefined}
          >
            <span
              aria-hidden="true"
              data-lens-hide
              className={`absolute bottom-[11px] right-3 rounded-[7px] px-[9px] py-1 font-mono text-[10px] text-white ${fade}`}
              style={{ background: "rgba(0,0,0,.6)" }}
            >
              ⛶ open {glyph}
            </span>
          </button>
        )}
        {ruler && (media === "image" || media === "video") && <MediaRuler view={view} pic={pic} />}
        {(media === "image" || media === "video") && (
          <Minimap src={media === "image" ? fullUrl : thumbUrl || undefined} view={view} box={zoom.box} pic={pic} onView={setView} />
        )}
        {media === "image" && lens && (
          <ZoomLens src={fullUrl} imgRef={imgRef} filter={shownFilter} view={view} mag={mag} clickThrough={finePointer} />
        )}
        {media === "video" && lens && (
          <VideoLens videoRef={videoRef} crop={crop} filter={shownFilter} view={view} mag={mag} clickThrough={finePointer} />
        )}
        <span
          data-lens-hide
          className={`absolute left-[10px] top-[10px] rounded-md px-2 py-1 font-mono text-[9px] font-bold ${fade}`}
          style={{ background: "rgba(0,0,0,.85)", color: accent }}
        >
          {badge}
        </span>
        {!!record.redacted && (
          <span
            data-lens-hide
            title="Redacted"
            aria-label="Redacted"
            className={`absolute right-[10px] top-[10px] rounded-md bg-red px-2 py-1 font-mono text-[9px] font-bold text-white ${fade}`}>
            R
          </span>
        )}
        {docIdx && (
          <span
            data-lens-hide
            className={`absolute left-1/2 top-[11px] -translate-x-1/2 rounded-full px-[9px] py-[3px] font-mono text-[9px] text-white ${fade}`}
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
            data-lens-hide
            className={`absolute left-2 top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full border border-white/25 text-[19px] text-white active:scale-90 ${fade}`}
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
            data-lens-hide
            className={`absolute right-2 top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full border border-white/25 text-[19px] text-white active:scale-90 ${fade}`}
            style={{ background: "rgba(0,0,0,.5)" }}
          >
            ›
          </button>
        )}
      </div>

      {media === "video" && (
        <VideoTransport
          key={id}
          videoRef={videoRef}
          crop={crop}
          fileUrl={`/api/file/${id}`}
          name={id}
          filter={adjustFilter(adjust)}
          view={view}
          startAt={startAt}
          keys={!(composer || viewer)}
          onShare={handleShare}
          onPost={handlePostFrame}
          speedSlot={speedSlot}
          stage={panel}
        />
      )}
      {(media === "image" || media === "video") && (
        <MediaToolbar
          adjust={adjust}
          onAdjust={setAdjust}
          lens={lens}
          onLens={setLens}
          mag={mag}
          onMag={setMag}
          view={view}
          onView={setView}
          onZoom={zoom.zoomBy}
          onLink={media === "image" ? () => handleShare() : undefined}
          onSave={media === "image" ? saveView : undefined}
          compare={compare}
          onCompare={setCompare}
          ruler={ruler}
          onRuler={setRuler}
          panelSlot={media === "video" ? setSpeedSlot : undefined}
          // desktop only: shortcuts need a keyboard
          keysHelp={
            isDesktop && finePointer
              ? `${media === "video" ? "Space play · , . frame · [ ] speed\nA loop A–B · M mute · C save frame\n" : ""}L lens · - = lens zoom (or Shift+wheel)\nDouble-click, Ctrl/⌘+wheel or pinch zoom, drag to pan\n0 reset · I invert · R rotate · F flip\nhold \\ original (no filters)`
              : undefined
          }
        />
      )}
      {media === "video" && (keyMoments.moments.length > 0 || aiMoments.length > 0) && (
        <KeyMoments official={keyMoments.moments} ai={aiMoments} videoRef={videoRef} onSeek={seekTo} />
      )}
      {detail.articles && detail.articles.length > 0 && (
        <Articles articles={detail.articles} currentId={record.id} onSeek={seekTo} />
      )}

      {/* chips row — prototype line 358 */}
      <div className="mb-[10px] flex flex-wrap gap-[7px]">
        <span
          className="rounded-[7px] border border-line2 px-[9px] py-1 font-mono text-[10px]"
          style={{ color: dataInk(accent) }}
        >
          {record.agency_full || record.agency}
        </span>
        {archiveLabel !== (record.agency_full || record.agency) && (
          <span className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim">
            {archiveLabel}
          </span>
        )}
        {detail.release && (
          <span
            className="rounded-[7px] border border-red px-[9px] py-1 font-mono text-[10px] font-semibold text-red"
            title={`war.gov release ${detail.release.no} · ${detail.release.date}`}
          >
            RELEASE {String(detail.release.no).padStart(2, "0")}
          </span>
        )}
      </div>

      {!isDesktop && titleBlock}

      <TldrCard
        tldr={detail.tldr}
        title={title}
        onBoring={() => summaryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
      />

      <VerdictBar recordId={record.id} state={detail.verdicts} />

      {/* meta grid — prototype lines 360-365 */}
      {/* empty fields are left out; an odd last cell spans the row */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line empty:hidden [&>:last-child:nth-child(odd)]:col-span-2">
        {(
          [
            ["Incident", record.incident_date && record.incident_date !== "N/A" ? record.incident_date : ""],
            ["Location", location],
            ["Released", record.doc_date || ""],
            ["VIRIN", record.virin || ""],
          ] as const
        ).map(([label, value]) => (value ? <MetaCell key={label} label={label} value={value} /> : null))}
      </div>
      {detail.topics && detail.topics.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-[7px] font-mono text-[10px]">
          <span className="text-faint">TOPICS</span>
          {detail.topics.map((t) => (
            <Link key={t.slug} to={`/topic/${t.slug}`} className="rounded-[7px] border border-line px-[9px] py-1 text-dim hover:border-signal hover:text-signal">
              {t.label}
            </Link>
          ))}
        </div>
      )}
      {detail.citedIn && detail.citedIn.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-[7px] font-mono text-[10px]">
          <span className="text-faint">CITED IN</span>
          {detail.citedIn.map((c) => (
            <Link key={c.slug} to={`/case/${c.slug}`} className="rounded-[7px] border border-line px-[9px] py-1 text-dim hover:border-signal hover:text-signal">{c.title}</Link>
          ))}
        </div>
      )}

      {/* summary — prototype line 366 */}
      <p ref={summaryRef} className="mb-4 scroll-mt-16 text-[14.5px] leading-[1.65] text-dim" style={{ whiteSpace: "pre-line" }}>
        {media === "video" ? keyMoments.prose : record.summary || ""}
      </p>

      {/* OPEN ORIGINAL — prototype line 367 */}
      <button
        type="button"
        onClick={handleOpenOriginal}
        className="mb-[22px] w-full rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.99]"
      >
        ⛶ OPEN ORIGINAL {glyph}
      </button>
      {srcLinks.length > 0 && (
        <div className="-mt-3 mb-[22px] flex flex-wrap justify-center gap-x-5 gap-y-1 font-mono text-[11px]">
          {srcLinks.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="py-1 text-dim hover:text-ink">
              ↗ {l.label} page
            </a>
          ))}
        </div>
      )}

      <FullText
        id={id}
        data={detail.fullText}
        kind={record.kind}
        page={pdfPage}
        onPageChange={(n) => {
          const sp = new URLSearchParams(paramsRef.current);
          sp.set("p", String(n));
          paramsRef.current = sp;
          setSearchParams(sp, { replace: true });
        }}
        onOpenOriginal={handleOpenOriginal}
      />

      {/* series prev/next — id neighbours (D029 ← D030 → D031), uapbrowser-style */}
      {(detail.series?.prev || detail.series?.next) && (
        <div className="mb-[22px] grid grid-cols-2 gap-2 font-mono">
          {[
            { id: detail.series.prev, t: detail.series.prevTitle, k: detail.series.prevKind, label: "← PREVIOUS IN SERIES", align: "text-left" },
            { id: detail.series.next, t: detail.series.nextTitle, k: detail.series.nextKind, label: "NEXT IN SERIES →", align: "text-right" },
          ].map(({ id: sid, t, k, label, align }) => {
            const sp = sid ? docTitleParts(sid, t, k ?? undefined) : null;
            return sid && sp ? (
              <Link
                key={label}
                to={`/doc/${sid}${toolQuery}`}
                className={`rounded-xl border border-line px-3 py-2.5 ${align} active:scale-[.99]`}
              >
                <div className="text-[9px] tracking-[.5px] text-faint">{label}</div>
                {sp.showId && (
                  <div className="mt-1 text-[10px] font-semibold" style={{ color: dataInk(accent), overflowWrap: "anywhere" }}>
                    {sp.id}
                  </div>
                )}
                <div className="mt-1 line-clamp-2 font-sans text-xs text-ink" style={{ overflowWrap: "anywhere" }}>
                  {sp.title}
                </div>
              </Link>
            ) : (
              <div key={label} />
            );
          })}
        </div>
      )}

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
                style={{ color: dataInk(pt.accent) }}
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
        {!(commentsError && !commentsData) && (
          <span className="font-mono text-[10px] text-signal">{plural(comments.length, "comment")}</span>
        )}
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
      {commentsError && !commentsData && <LoadError error={commentsError} onRetry={() => void refetchComments()} />}
      <div className="flex flex-col gap-[10px]">
        {comments.map((c) => (
          <div key={c.id} className="rounded-xl border border-line bg-surface p-[13px]">
            <div className="mb-[7px] flex flex-wrap items-center gap-2">
              {c.handleShow && <span className="font-mono text-[10px] text-cyan">{c.handleShow}</span>}
              <span
                role="img"
                aria-label={c.stance ?? "neutral"}
                title={c.stance ?? "neutral"}
                className="text-[12px] leading-none"
                style={{ color: stanceColor(c.stance) }}
              >
                ●
              </span>
              <span className="font-mono text-[9px] text-faint">ID:{c.id}</span>
              <span className="ml-auto font-mono text-[9px] text-faint">{c.ago}</span>
            </div>
            <div className="text-[13px] leading-[1.55] text-ink" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {media === "video" ? withMoments(c.body, seekTo) : c.body}
            </div>
            {c.image_url && <UploadThumb url={c.image_url} />}
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
                onClick={() => handlePromote(c)}
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

      {/* related files — uapbrowser-style groups: war.gov's related media,
          then shared topic / location / period / release / agency (worker dedupes, so a file shows in one group only) */}
      {detail.related?.map((g) => (
        <section key={g.key} className="mt-[30px]">
          <div className="mb-2.5 font-mono text-[9px] uppercase tracking-[.6px] text-faint">
            {RELATED_HEAD[g.key]} · <span className="text-dim">{g.label}</span>
          </div>
          <div className="grid grid-flow-row-dense grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
            {g.records.map((r) => (
              <DocCard key={r.id} record={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default Doc;
