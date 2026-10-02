// Archive screen: search / filter / grid. Ported from
// realufo-handoff/RealUFO.dc.html lines 167-205 (the `showArchive` branch of
// `data-screenpad`): search input + "AI-RAG soon" chip, a horizontally
// scrolling archive-chip row (All + one per bootstrap archive), type chips
// (All/Docs/Video), a "redacted only" toggle, a result-count line, the
// DocCard grid, and the "no records match" empty state.
//
// This component renders ONLY that screen content — AppShell (Task 14) owns
// the app frame, AppBar, and nav, and mounts this inside its `<Outlet/>`
// (itself inside `data-screenpad`); the router wires `/archive` -> Archive
// (router.tsx).
//
// Filters are modeled as URL search params (`q`, `archive`, `type`,
// `redacted`) via react-router's `useSearchParams`, so a filtered view is
// shareable/back-button-friendly (the task brief's explicit requirement).
// All four are read fresh from the URL on every render EXCEPT the search
// box's own text, which needs a faster local echo than the ~250ms debounce
// applied before writing to the `q` param — typing straight into the query
// param would fire a fetch on every keystroke. `setParam`/the debounce
// effect both use `setSearchParams`'s functional-updater form (merging into
// whatever `prev` is, not a stale closed-over snapshot) with `{replace:
// true}` so filtering doesn't spam a history entry per keystroke/chip click.
//
// Data: useBootstrap() for the archive chip row (id/flag/label/count/accent);
// useRecords({q,archive,type,redacted}) for the grid + result count. Both
// default to []/0 while a query hasn't resolved (or errored) so nothing here
// ever indexes into `undefined`. The result-count/grid/empty-state block
// swaps to a small "◉ loading signal…" line while useRecords()'s *initial*
// fetch is in flight (`isLoading` — true only before the first settle, same
// convention as Feed.tsx) so a filter change never flashes an empty state.
//
// Pagination: a 1-based `page` URL param -> useRecords({limit, offset}),
// RECORDS_PAGE_SIZE matching the Worker's default limit. Any filter change drops
// `page` (back to 1). Page clicks push a history entry (unlike filters) so
// back steps through pages, and scroll the shell's `[data-scroll]` main back
// to the top. useRecords keeps the previous page on screen while the next
// one loads (dimmed) instead of flashing the loading line. DocCards carry
// the whole query string (filters + page) to /doc so its swipe list is this
// exact page (Doc.tsx crosses into neighbour pages at the edges).
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useBootstrap, useRecords } from "../api/queries";
import { DocCard } from "../components/DocCard";
import { useSetPageTitle } from "../lib/pageTitle";
import { RECORDS_PAGE_SIZE, recordsPage } from "../lib/recordsPage";

const SEARCH_DEBOUNCE_MS = 250;

// First, last, and current±1, with "…" for each skipped run:
// (5, 20) -> [1, "…", 4, 5, 6, "…", 20].
export function pageList(page: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

interface PagerProps {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}

function Pager({ page, totalPages, onPage }: PagerProps) {
  const btn = "min-w-[30px] rounded-lg px-[9px] py-[5px] font-mono text-[11px] active:scale-[.96] disabled:opacity-35 disabled:active:scale-100";
  return (
    <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
      <button type="button" className={btn} style={typeChipStyle(false)} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ prev
      </button>
      {pageList(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap${i}`} className="px-1 font-mono text-[11px] text-faint">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={btn}
            style={typeChipStyle(p === page)}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className={btn} style={typeChipStyle(false)} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        next ›
      </button>
    </nav>
  );
}

// Jump-to-page box: native number input, Enter or "go" submits; out-of-range
// values clamp to 1..totalPages. Uncontrolled + keyed on `page` so it resets
// to the current page after every navigation.
function PageJump({ page, totalPages, onPage }: PagerProps) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Math.floor(Number(new FormData(e.currentTarget).get("page")));
    if (!n) return;
    const target = Math.min(totalPages, Math.max(1, n));
    if (target !== page) onPage(target);
  }
  return (
    <form key={page} onSubmit={handleSubmit} className="mt-2.5 flex items-center justify-center gap-1.5 font-mono text-[11px] text-faint">
      <label htmlFor="archive-page-jump">jump to</label>
      <input
        id="archive-page-jump"
        name="page"
        type="number"
        inputMode="numeric"
        min={1}
        max={totalPages}
        defaultValue={page}
        className="w-[64px] rounded-lg border border-line2 bg-surface px-2 py-[5px] text-center text-[11px] text-ink outline-none focus:border-signal"
      />
      <span>/ {totalPages}</span>
      <button type="submit" className="rounded-lg px-[9px] py-[5px] text-[11px] active:scale-[.96]" style={typeChipStyle(false)}>
        go
      </button>
    </form>
  );
}

// "label first segment": bootstrap archive labels pack a short code and a
// longer aside separated by " · " (e.g. "NARA · Blue Book", "UK · National
// Archives", "War.gov · PURSUE") — the chip only has room for the short
// code, so split on the middle dot and keep the first segment; labels with
// no "·" (e.g. "AARO", "NASA UAP") pass through unchanged.
function chipLabel(label: string): string {
  return label.split("·")[0].trim();
}

// Brief's literal formula/example: count>999 ? round(count/1000)+'k' :
// count — e.g. the "NARA · Blue Book" seed archive's 12618 -> "13k".
function abbreviateCount(count: number): string {
  if (count > 999) return `${Math.round(count / 1000)}k`;
  return String(count);
}

// Archive-chip styling — ported verbatim from the prototype's `archChips`
// `.map()` (RealUFO.dc.html:592):
//   `on = s.fArch===c.id`;
//   color:  on ? (c.id==='all' ? 'var(--signal)' : '#fff') : 'var(--dim)'
//   bg:     on ? (archMap[c.id] ? archMap[c.id].accent : 'var(--signal-dim)') : 'transparent'
//   border: on ? 'transparent' : 'var(--line2)'
// i.e. a selected *specific* archive chip is a SOLID fill of that archive's
// own accent color with white text (not an accent-tinted translucent chip);
// the "All" chip (no accent of its own) falls back to var(--signal-dim)/
// var(--signal) instead, same as the generic nav-active treatment.
function archiveChipStyle(selected: boolean, isAll: boolean, accent?: string): CSSProperties {
  if (!selected) {
    return { border: "1px solid var(--line2)", background: "transparent", color: "var(--dim)" };
  }
  return {
    border: "1px solid transparent",
    background: isAll ? "var(--signal-dim)" : (accent ?? "var(--signal-dim)"),
    color: isAll ? "var(--signal)" : "#fff",
  };
}

// Type-chip styling — ported verbatim from the prototype's `typeChips`
// `.map()` (RealUFO.dc.html:594): distinct from archive chips — a selected
// type chip keeps the var(--signal) OUTLINE (not transparent) plus the
// var(--signal-dim) fill, it never solid-fills.
function typeChipStyle(selected: boolean): CSSProperties {
  return selected
    ? { border: "1px solid var(--signal)", background: "var(--signal-dim)", color: "var(--signal)" }
    : { border: "1px solid var(--line2)", background: "transparent", color: "var(--dim)" };
}

interface ChipProps {
  selected: boolean;
  style: CSSProperties;
  onClick: () => void;
  children: ReactNode;
}

// Archive-chip button chrome — prototype line 176: `padding:7px 11px;
// border-radius:9px; font-size:11px; gap:6px`.
function ArchiveChip({ selected, style, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[7px] font-mono text-[11px] active:scale-[.96]"
      style={style}
    >
      {children}
    </button>
  );
}

// Type-chip button chrome — prototype line 182: `padding:5px 10px;
// border-radius:8px; font-size:10.5px` (no icon/gap — label text only).
function TypeChip({ selected, style, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-lg px-[10px] py-[5px] font-mono text-[10.5px] active:scale-[.96]"
      style={style}
    >
      {children}
    </button>
  );
}

export function Archive() {
  const { data: boot } = useBootstrap();
  const totalRecords = boot?.stats?.records;
  const totalSources = boot?.stats?.archives;
  // AppBar title — prototype's `titles.archive` (RealUFO.dc.html:566), with
  // REAL counts (no fake fillups).
  useSetPageTitle(
    "THE ARCHIVE",
    totalRecords != null ? `${totalRecords.toLocaleString()} records · ${totalSources ?? 0} sources` : "Declassified records",
  );

  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const archive = searchParams.get("archive") ?? "";
  const type = searchParams.get("type") ?? "";
  const redacted = searchParams.get("redacted") === "1";
  const page = recordsPage(searchParams);
  const rootRef = useRef<HTMLDivElement>(null);

  // Local echo of the search box so every keystroke feels instant; only the
  // debounced value below is ever written to the `q` param / handed to
  // useRecords.
  const [inputValue, setInputValue] = useState(q);

  // Keep the input in sync when `q` changes from elsewhere (back/forward
  // nav, a shared link, another chip clearing filters) without fighting the
  // user's own typing.
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Debounce: ~250ms after the user stops typing, push the value to the `q`
  // param (skipped entirely if it already matches, e.g. the sync above just
  // echoed it back).
  useEffect(() => {
    if (inputValue === q) return;
    const handle = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (inputValue) next.set("q", inputValue);
          else next.delete("q");
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // `q` deliberately excluded — this effect only reacts to the user's own
    // typing (`inputValue`); reacting to `q` too would re-fire the same
    // write it just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  function goToPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set("page", String(p));
      else next.delete("page");
      return next;
    });
    rootRef.current?.closest("[data-scroll]")?.scrollTo?.({ top: 0 });
  }

  const archives = boot?.archives ?? [];

  const { data, isLoading, isPlaceholderData } = useRecords(
    {
      q: q || undefined,
      archive: archive || undefined,
      type: type || undefined,
      redacted: redacted || undefined,
      limit: RECORDS_PAGE_SIZE,
      offset: (page - 1) * RECORDS_PAGE_SIZE,
    },
    { keepPrevious: true },
  );
  const records = data?.records ?? [];
  const count = data?.count ?? 0;
  const totalPages = Math.ceil(count / RECORDS_PAGE_SIZE);

  return (
    <div ref={rootRef} data-screen="archive" className="animate-[fadeup_.35s_ease_both]">
      {/* search bar — lines 169-173 */}
      <div className="mb-3.5 flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5">
        <span aria-hidden="true" className="text-[15px] text-faint">
          ⌕
        </span>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={
            totalRecords != null
              ? `search ${totalRecords.toLocaleString()} records — title, agency, location…`
              : "search the archive — title, agency, location…"
          }
          className="flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
        />
        <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[9px] text-faint">
          AI-RAG soon
        </span>
      </div>

      {/* static predecessor archive (war-gov-ufo-release repo) */}
      <a
        href="https://release.realufo.org/"
        target="_blank"
        rel="noopener"
        className="mb-3.5 block font-mono text-[11px] text-dim hover:text-signal"
      >
        Original release archive → release.realufo.org ↗
      </a>

      {/* archive chip row — lines 174-178 */}
      <div data-scroll className="mb-1.5 flex gap-[7px] overflow-x-auto pb-2.5">
        <ArchiveChip selected={archive === ""} style={archiveChipStyle(archive === "", true)} onClick={() => setParam("archive", null)}>
          {/* prototype archChips seeds the "all" entry with flag:'🛰' (RealUFO.dc.html:591) */}
          <span aria-hidden="true">🛰</span>
          All
        </ArchiveChip>
        {archives.map((a) => (
          <ArchiveChip
            key={a.id}
            selected={archive === a.id}
            style={archiveChipStyle(archive === a.id, false, a.accent)}
            onClick={() => setParam("archive", a.id)}
          >
            <span aria-hidden="true">{a.flag}</span>
            {chipLabel(a.label)} <span className="opacity-60">{abbreviateCount(a.count)}</span>
          </ArchiveChip>
        ))}
      </div>

      {/* type chips + redacted toggle — lines 179-186 */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 px-0.5 py-1">
        <div className="flex gap-1.5">
          <TypeChip selected={type === ""} style={typeChipStyle(type === "")} onClick={() => setParam("type", null)}>
            All
          </TypeChip>
          <TypeChip selected={type === "pdf"} style={typeChipStyle(type === "pdf")} onClick={() => setParam("type", "pdf")}>
            Docs
          </TypeChip>
          <TypeChip selected={type === "video"} style={typeChipStyle(type === "video")} onClick={() => setParam("type", "video")}>
            Video
          </TypeChip>
          <TypeChip selected={type === "image"} style={typeChipStyle(type === "image")} onClick={() => setParam("type", "image")}>
            Images
          </TypeChip>
        </div>

        <button
          type="button"
          onClick={() => setParam("redacted", redacted ? null : "1")}
          aria-pressed={redacted}
          className="flex items-center gap-[7px] font-mono text-[10.5px]"
          style={{ color: redacted ? "var(--red)" : "var(--dim)" }}
        >
          <span
            aria-hidden="true"
            className="grid h-[15px] w-[15px] place-items-center rounded-[4px] text-[10px] text-white"
            style={{
              border: `1px solid ${redacted ? "var(--red)" : "var(--line)"}`,
              background: redacted ? "var(--red)" : "transparent",
            }}
          >
            {redacted ? "✓" : ""}
          </span>
          redacted only
        </button>
      </div>

      {isLoading ? (
        <div className="font-mono text-[11px] text-faint">◉ loading signal…</div>
      ) : (
        <>
          {/* result count — line 187 */}
          <div className="mx-0.5 mb-3 font-mono text-[10px] uppercase tracking-[.8px] text-faint">
            <b className="text-signal">{count.toLocaleString()}</b> records
            {totalPages > 1 && ` · page ${page} / ${totalPages}`} · swipe a file to flip through
          </div>

          {/* grid — lines 188-203 */}
          <div
            data-grid
            className={`transition-opacity ${isPlaceholderData ? "opacity-50" : ""} grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]`}
          >
            {records.map((record) => (
              <DocCard key={record.id} record={record} variant="grid" search={searchParams.toString()} />
            ))}
          </div>

          {/* empty state — line 204 */}
          {count === 0 && (
            <div className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
              no records match.
              <br />
              the truth is elsewhere.
            </div>
          )}

          {totalPages > 1 && (
            <>
              <Pager page={page} totalPages={totalPages} onPage={goToPage} />
              <PageJump page={page} totalPages={totalPages} onPage={goToPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Archive;
