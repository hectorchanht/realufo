// Comment / reply / new-thread composer sheet. Ported from
// realufo-handoff/RealUFO.dc.html lines 416-434 (markup) + 496-513
// (submitComposer state logic) + 638-649 (composer view-model, incl.
// `stanceOpts` and the `headline`/`asLabel` derivations).
//
// Local form state (body/stance/handle/threadTitle/img) lives in this
// component rather than in OverlayProvider — the prototype's `setComposer`
// patches a single global `composer` object, but since Composer only ever
// exists while `composer` opts are non-null (OverlayHost mounts/unmounts it
// on open/close), a fresh local useState per mount is equivalent and simpler.
//
// Drag-to-dismiss ports `sheetDown`/`sheetMove`/`sheetEnd` (prototype lines
// 523-525) verbatim (>110px downward drag closes, else it springs back) —
// the prototype's own composer markup has no separate drag handle, so a
// small grab-bar element is added here purely to host that pointer handling
// without stealing pointer capture from the header's close button or any
// input inside the sheet.
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAddComment, useCreateThread, useReply } from "../api/queries";
import { ApiError } from "../api/client";
import type { Stance } from "../api/types";
import { useOverlay, type ComposerMode } from "./OverlayProvider";

type StanceValue = NonNullable<Stance>;

// prototype line 639: `[['neutral','Neutral','var(--dim)'], ...]`.
const STANCE_OPTS: Array<{ id: StanceValue; label: string; color: string }> = [
  { id: "neutral", label: "Neutral", color: "var(--dim)" },
  { id: "believer", label: "Believer", color: "var(--grn)" },
  { id: "skeptic", label: "Skeptic", color: "var(--amber)" },
  { id: "analyst", label: "Analyst", color: "var(--cyan)" },
];

// prototype line 644.
const HEADLINES: Record<ComposerMode, string> = {
  comment: "ADD A COMMENT",
  reply: "POST A REPLY",
  newThread: "NEW THREAD",
};

const DRAG_CLOSE_PX = 110; // prototype line 525: `if(d>110){...}`
const SHEET_TRANSITION = "transform .34s cubic-bezier(.32,.72,0,1)"; // prototype line 525

export function Composer() {
  const { composer, closeComposer, toast, me } = useOverlay();
  const navigate = useNavigate();

  // Always called (never conditionally) so hook order stays stable across
  // renders — the empty-string fallback id is inert until .mutate() fires,
  // and only the branch matching `composer.mode` is ever invoked on submit.
  const addComment = useAddComment(composer?.recordId ?? "");
  const reply = useReply(composer?.threadId ?? "");
  const createThread = useCreateThread();

  const [body, setBody] = useState(composer?.presetBody ?? "");
  const [stance, setStance] = useState<StanceValue>("neutral");
  const [handle, setHandle] = useState(me?.handle ?? "");
  const [threadTitle, setThreadTitle] = useState(composer?.presetTitle ?? "");
  const [img, setImg] = useState(false);

  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; dragging: boolean }>({ startY: 0, dragging: false });

  if (!composer) return null;

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { startY: e.clientY, dragging: true };
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // pointer capture isn't implemented everywhere (e.g. jsdom) — harmless.
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    const d = Math.max(0, e.clientY - dragRef.current.startY);
    const el = sheetRef.current;
    if (el) el.style.transform = `translateY(${d}px)`;
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    const d = e.clientY - dragRef.current.startY;
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = SHEET_TRANSITION;
    if (d > DRAG_CLOSE_PX) {
      el.style.transform = "translateY(100%)";
      setTimeout(() => closeComposer(), 200);
    } else {
      el.style.transform = "translateY(0)";
    }
  }

  function handleMutationError(err: unknown) {
    // FRONTEND-CONTEXT.md: "write endpoints may return 429 (rate limit) —
    // surface as a toast" — the exact copy is specified in the Task 16 brief.
    if (err instanceof ApiError && err.status === 429) {
      toast("slow down — too many posts");
    } else {
      toast("Could not post — try again");
    }
  }

  function handleSubmit() {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      toast("Say something first"); // prototype line 499
      return;
    }
    const trimmedHandle = handle.trim() || undefined;

    if (composer!.mode === "comment") {
      addComment.mutate(
        { body: trimmedBody, stance, handle: trimmedHandle },
        {
          onSuccess: () => {
            toast("Posted");
            closeComposer();
          },
          onError: handleMutationError,
        },
      );
      return;
    }

    if (composer!.mode === "reply") {
      reply.mutate(
        { body: trimmedBody, stance, handle: trimmedHandle, image_label: img ? "your_upload.png" : undefined },
        {
          onSuccess: () => {
            toast("Posted");
            closeComposer();
          },
          onError: handleMutationError,
        },
      );
      return;
    }

    // mode === 'newThread' — title falls back to the body's first line,
    // matching the prototype's submitComposer (RealUFO.dc.html line 504).
    const title = threadTitle.trim() || trimmedBody.split("\n")[0].slice(0, 70) || "Untitled thread";
    createThread.mutate(
      {
        board: composer!.boardId || "uap",
        title,
        op_body: trimmedBody,
        stance,
        handle: trimmedHandle,
        source_record_id: composer!.sourceRecordId,
      },
      {
        onSuccess: (data) => {
          toast("Posted");
          closeComposer();
          navigate(`/thread/${data.thread.id}`);
        },
        onError: handleMutationError,
      },
    );
  }

  const asLabel = handle.trim() || "Anonymous"; // prototype line 645

  return (
    <div className="fixed inset-0 z-[80] animate-[fadein_.2s_ease]" data-composer>
      <div
        onClick={closeComposer}
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,.62)" }}
      />
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 animate-[sheetin_.34s_cubic-bezier(.32,.72,0,1)] rounded-t-[22px] border-t border-line2 bg-bg2 px-4 pb-[18px] pt-2"
      >
        {/* Drag handle — not in the prototype markup (which has no dedicated
            grab affordance), added so sheetDown/Move/End can be ported without
            capturing pointer events meant for the close button / inputs below. */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="mb-2 flex touch-none justify-center py-1"
          aria-hidden="true"
        >
          <div className="h-[5px] w-[42px] rounded-full bg-line2" />
        </div>

        <div className="mb-[14px] flex items-center gap-[10px]">
          <div className="flex-1">
            <div className="font-pixel text-[8px] tracking-[.5px] text-signal">{HEADLINES[composer.mode]}</div>
          </div>
          <button
            type="button"
            onClick={closeComposer}
            aria-label="Close composer"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-line2 text-base text-dim active:scale-[.94]"
          >
            ✕
          </button>
        </div>

        {composer.refLabel && (
          <div className="mb-[11px] flex items-center gap-[9px] rounded-[10px] border border-line2 bg-surface px-[11px] py-[9px]">
            <span className="flex-none text-sm" aria-hidden="true">
              ◨
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[8.5px] tracking-[.5px] text-faint">REFERENCING FILE</div>
              <div className="mt-[3px] truncate text-xs text-cyan">{composer.refLabel}</div>
            </div>
          </div>
        )}

        {composer.mode === "newThread" && (
          <input
            value={threadTitle}
            onChange={(e) => setThreadTitle(e.target.value)}
            placeholder="Thread title"
            className="mb-[11px] w-full rounded-[10px] border border-line2 bg-surface px-3 py-[10px] font-body text-sm font-semibold text-ink outline-none"
          />
        )}

        <div className="mb-[11px] flex gap-1.5">
          {STANCE_OPTS.map((o) => {
            const active = stance === o.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setStance(o.id)}
                className="flex-1 rounded-[9px] border px-1 py-[7px] font-mono text-[10px] font-semibold active:scale-[.96]"
                style={{
                  borderColor: o.color,
                  background: active ? o.color : "transparent",
                  color: active ? "#04140c" : o.color,
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say your piece. Keep it sourced."
          className="min-h-[100px] w-full resize-none rounded-xl border border-line2 bg-surface p-3 font-body text-sm leading-[1.5] text-ink outline-none"
        />

        <div className="mt-[11px] flex items-center gap-[10px]">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle (optional)"
            className="min-w-0 flex-1 rounded-[10px] border border-line2 bg-surface px-[11px] py-[9px] font-mono text-xs text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setImg((v) => !v)}
            className="flex-none rounded-[10px] border border-dashed border-line2 px-3 py-[9px] font-mono text-[11px] active:scale-[.96]"
            style={{ color: img ? "var(--signal)" : "var(--dim)" }}
          >
            {img ? "✓ image attached" : "＋ attach image"}
          </button>
        </div>

        <div className="mt-[14px] flex items-center gap-3">
          <span className="flex-1 font-mono text-[9.5px] text-faint">◉ Posting as {asLabel}</span>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-none rounded-[11px] bg-signal px-[22px] py-[11px] font-mono text-xs font-bold tracking-[.5px] text-[#04140c] active:scale-[.96]"
          >
            POST →
          </button>
        </div>
      </div>
    </div>
  );
}

export default Composer;
