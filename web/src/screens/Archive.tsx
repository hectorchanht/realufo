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
// Pagination: the prototype markup at lines 167-205 has no "load more"/pager
// control (`useRecords` supports `limit`/`offset`, but nothing here calls
// with them) — out of scope for this task; a later task can add paging once
// the prototype defines it.
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useBootstrap, useRecords } from "../api/queries";
import { DocCard } from "../components/DocCard";

const SEARCH_DEBOUNCE_MS = 250;

// Prototype line 171's literal placeholder copy.
const SEARCH_PLACEHOLDER = "search 91,808 records — title, agency, location…";

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

// Selected-chip fill for a specific archive: accent-tinted background/border/
// text using the archive's own accent hex (bootstrap always ships a 6-digit
// hex like "#9184d9" — `hexAlpha` falls back to the bare color for anything
// else, e.g. if an accent ever arrived as a CSS var).
function hexAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

function archiveChipStyle(selected: boolean, accent: string): CSSProperties {
  return selected
    ? { border: `1px solid ${accent}`, background: hexAlpha(accent, 0.16), color: accent }
    : { border: "1px solid var(--line2)", background: "transparent", color: "var(--dim)" };
}

// Selected-chip fill for the generic (non-archive-specific) "All" archive
// chip and the three type chips — same var(--signal) treatment TopNav.tsx
// already uses for its active nav item.
function signalChipStyle(selected: boolean): CSSProperties {
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

function Chip({ selected, style, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 py-[7px] font-mono text-[11px] active:scale-[.96]"
      style={style}
    >
      {children}
    </button>
  );
}

export function Archive() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const archive = searchParams.get("archive") ?? "";
  const type = searchParams.get("type") ?? "";
  const redacted = searchParams.get("redacted") === "1";

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
        return next;
      },
      { replace: true },
    );
  }

  const { data: boot } = useBootstrap();
  const archives = boot?.archives ?? [];

  const { data, isLoading } = useRecords({
    q: q || undefined,
    archive: archive || undefined,
    type: type || undefined,
    redacted: redacted || undefined,
  });
  const records = data?.records ?? [];
  const count = data?.count ?? 0;

  return (
    <div data-screen="archive" className="animate-[fadeup_.35s_ease_both]">
      {/* search bar — lines 169-173 */}
      <div className="mb-3.5 flex items-center gap-[9px] rounded-xl border border-line2 bg-surface px-[13px] py-2.5">
        <span aria-hidden="true" className="text-[15px] text-faint">
          ⌕
        </span>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          className="flex-1 border-0 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-faint"
        />
        <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[9px] text-faint">
          AI-RAG soon
        </span>
      </div>

      {/* archive chip row — lines 174-178 */}
      <div data-scroll className="mb-1.5 flex gap-[7px] overflow-x-auto pb-2.5">
        <Chip selected={archive === ""} style={signalChipStyle(archive === "")} onClick={() => setParam("archive", null)}>
          All
        </Chip>
        {archives.map((a) => (
          <Chip key={a.id} selected={archive === a.id} style={archiveChipStyle(archive === a.id, a.accent)} onClick={() => setParam("archive", a.id)}>
            <span aria-hidden="true">{a.flag}</span>
            {chipLabel(a.label)} <span className="opacity-60">{abbreviateCount(a.count)}</span>
          </Chip>
        ))}
      </div>

      {/* type chips + redacted toggle — lines 179-186 */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 px-0.5 py-1">
        <div className="flex gap-1.5">
          <Chip selected={type === ""} style={signalChipStyle(type === "")} onClick={() => setParam("type", null)}>
            All
          </Chip>
          <Chip selected={type === "pdf"} style={signalChipStyle(type === "pdf")} onClick={() => setParam("type", "pdf")}>
            Docs
          </Chip>
          <Chip selected={type === "video"} style={signalChipStyle(type === "video")} onClick={() => setParam("type", "video")}>
            Video
          </Chip>
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
            <b className="text-signal">{count}</b> records · swipe a file to flip through
          </div>

          {/* grid — lines 188-203 */}
          <div data-grid className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
            {records.map((record) => (
              <DocCard key={record.id} record={record} variant="grid" />
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
        </>
      )}
    </div>
  );
}

export default Archive;
