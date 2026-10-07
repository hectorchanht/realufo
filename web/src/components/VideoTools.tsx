// Video analysis tools for the Doc media panel, uapbrowser-style: frame
// step, timecode, speed, loop / loop A–B, mute, full screen, download, keyboard shortcuts, capture
// frame (save, or post to the discussion), link to the current moment, and a
// zoom lens. Adjust filters / palettes / rotate come from ImageTools.
//
// Playback stays on the CDN <video>. Its responses are cached without CORS
// headers, so the canvas is tainted: fine for the lens (drawing only), but
// capture can't read pixels from it. Capture instead seeks a hidden copy of
// the same file through our same-origin /api/file/:id route.
//
// Playback state lives in useVideoTransport (lib): the transport row here and
// the media console deck drive the same state.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Camera, Download, Link, LoaderCircle, Maximize, MessageSquarePlus, Minimize, Pause, Play, StepBack, StepForward, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { AdjustButton, LENS_PX, LensLayer, chip, ico, lensTurn, off, on } from "./ImageTools";
import type { LensHit } from "./ImageTools";
import type { MediaView } from "../lib/mediaView";
import { FPS, SPEEDS, frameOf } from "../lib/useVideoTransport";
import type { VideoCtl } from "../lib/useVideoTransport";
import { formatMoment } from "../lib/recordMedia";
import type { VideoCrop } from "../lib/recordMedia";
import type { KeyMoment } from "../lib/keyMoments";

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// Transport button groups: related controls share one pill. The button row
// scrolls horizontally (filter-pills pattern) when wider than the viewport,
// so a pill never squeezes or breaks mid-row — each is flex-none.
// Two pills: Playback [play][timecode] | [prev][Fnnn][next], Tools [view + share].
const tgroup = "inline-flex flex-nowrap items-center gap-1 rounded-[12px] bg-white/[0.04] px-1 py-1";

/** The playback row (video only): seek bar, play, frame step, timecode, mute, full screen. */
export function VideoTransport({
  ctl,
  keys,
  onShare,
  adjustOpen,
  onToggleAdjust,
  adjustChanged,
}: {
  /** Playback state (useVideoTransport); the console deck drives the same object. */
  ctl: VideoCtl;
  /** Keyboard shortcuts live (off while an overlay is open). */
  keys: boolean;
  /** Copy a link to the current moment. */
  onShare: (t: number) => void;
  /** Adjust panel state, lifted to the page so this row can host the button after Download. */
  adjustOpen: boolean;
  onToggleAdjust: (open: boolean) => void;
  /** A filter/look is active: highlight the Adjust button. */
  adjustChanged: boolean;
}) {
  const { t, dur, playing, muted, full, capture } = ctl;

  // Shortcuts (Doc owns ←/→ file nav, Esc, and the lens/filter/rotate keys).
  const act = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    act.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const k = e.key.toLowerCase();
      // a focused <video> already toggles on Space itself
      if ((k === " " && (document.activeElement as HTMLElement | null)?.tagName !== "VIDEO") || k === "k") ctl.togglePlay();
      else if (k === ",") ctl.stepFrame(-1);
      else if (k === ".") ctl.stepFrame(1);
      else if (k === "[") ctl.setRate(SPEEDS[Math.max(0, SPEEDS.indexOf(ctl.rate) - 1)]);
      else if (k === "]") ctl.setRate(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(ctl.rate) + 1)]);
      else if (k === "a") ctl.markAb();
      else if (k === "m") ctl.toggleMute();
      else if (k === "c") void ctl.grab("save");
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    if (!keys) return;
    const h = (e: KeyboardEvent) => act.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [keys]);

  return (
    <div className="mb-2">
      {/* own seek bar: the native controls hide while the video is zoomed/rotated */}
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={dur || 0}
        step={1 / FPS}
        value={Math.min(t, dur || 0)}
        onChange={(e) => ctl.seek(Number(e.target.value))}
        className="mb-2 w-full accent-[var(--signal)]"
      />
      {/* button row: horizontal scroll (filter-pills pattern) when wider than the viewport */}
      <div data-scroll className="flex items-center gap-2 overflow-x-auto pb-1">
      {/* transport group: play/pause + timecode + frame stepper as one compact unit */}
      <span role="group" aria-label="Playback" className={`${tgroup} flex-none`}>
        <button type="button" aria-label={playing ? "Pause" : "Play"} title={`${playing ? "Pause" : "Play"} (Space)`} onClick={ctl.togglePlay} className={`${chip} ${off}`}>
          {playing ? <Pause {...ico} /> : <Play {...ico} />}
        </button>
        <span className="whitespace-nowrap px-1 font-mono text-[10px] tabular-nums text-dim">
          {formatMoment(t, true)} / {formatMoment(dur, true)}
        </span>
        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line2" />
        <button type="button" aria-label="Previous frame" title="Previous frame (,)" onClick={() => ctl.stepFrame(-1)} className={`${chip} ${off}`}>
          <StepBack {...ico} />
        </button>
        <span className="whitespace-nowrap px-1 font-mono text-[10px] tabular-nums text-faint">F{frameOf(t)}</span>
        <button type="button" aria-label="Next frame" title="Next frame (.)" onClick={() => ctl.stepFrame(1)} className={`${chip} ${off}`}>
          <StepForward {...ico} />
        </button>
      </span>
      {/* tools group: view options + share actions */}
      <span role="group" aria-label="Tools" className={`${tgroup} flex-none`}>
        <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} title={`${muted ? "Unmute" : "Mute"} (M)`} onClick={ctl.toggleMute} className={`${chip} ${muted ? on : off}`}>
          {muted ? <VolumeX {...ico} /> : <Volume2 {...ico} />}
        </button>
        <button type="button" aria-label={full ? "Exit full screen" : "Full screen"} aria-pressed={full} title={full ? "Exit full screen (Esc)" : "Full screen"} onClick={ctl.toggleFull} className={`${chip} ${full ? on : off}`}>
          {full ? <Minimize {...ico} /> : <Maximize {...ico} />}
        </button>
        <button type="button" aria-label="Download video" title="Download video" onClick={ctl.download} className={`${chip} ${off}`}>
          <Download {...ico} />
        </button>
        {/* the Adjust panel's button lives here (after Download); its tools moved inside the panel */}
        <AdjustButton open={adjustOpen} onToggle={onToggleAdjust} changed={adjustChanged} />
        <button
          type="button"
          aria-label="Copy link to this moment"
          title={`Copy link @${formatMoment(t)}`}
          onClick={() => onShare(ctl.now())}
          className={`${chip} ${off}`}
        >
          <Link {...ico} />
        </button>
        <button
          type="button"
          aria-label={capture === "failed" ? "Capture failed, retry" : "Capture frame"}
          title={capture === "failed" ? "Capture failed — retry (C)" : "Save frame (C)"}
          onClick={() => ctl.grab("save")}
          disabled={capture === "busy"}
          className={`${chip} ${capture === "failed" ? "border-amber text-amber" : off}`}
        >
          {capture === "busy" ? <LoaderCircle {...ico} className="animate-spin" /> : capture === "failed" ? <TriangleAlert {...ico} /> : <Camera {...ico} />}
        </button>
        <button
          type="button"
          aria-label="Post frame to discussion"
          title="Post frame to discussion"
          onClick={() => ctl.grab("post")}
          disabled={capture === "busy"}
          className={`${chip} ${off}`}
        >
          {capture === "busy" ? <LoaderCircle {...ico} className="animate-spin" /> : <MessageSquarePlus {...ico} />}
        </button>
      </span>
      </div>
    </div>
  );
}

/** Video lens: redraws the zoomed region every frame, so it tracks playback. */
export function VideoLens({
  videoRef,
  crop,
  filter,
  view,
  mag,
  clickThrough,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  crop: VideoCrop | null; // the picture is this box of the frame (black bars cut off)
  filter: string;
  view: MediaView;
  mag: number;
  clickThrough: boolean;
}) {
  return (
    <LensLayer
      view={view}
      mag={mag}
      clickThrough={clickThrough}
      deadBottom={48} // native control bar stays usable
      size={() => {
        const v = videoRef.current;
        return v?.videoWidth ? (crop ?? { w: v.videoWidth, h: v.videoHeight }) : null;
      }}
    >
      {(hit) => <LensCanvas videoRef={videoRef} crop={crop} hit={hit} filter={filter} />}
    </LensLayer>
  );
}

function LensCanvas({
  videoRef,
  crop,
  hit,
  filter,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  crop: VideoCrop | null;
  hit: LensHit;
  filter: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef(hit);
  const cropRef = useRef(crop);
  useEffect(() => {
    hitRef.current = hit;
    cropRef.current = crop;
  }, [hit, crop]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = videoRef.current;
      const ctx = canvas.current?.getContext("2d");
      const h = hitRef.current;
      if (v?.videoWidth && ctx) {
        const px = ctx.canvas.width;
        const p = cropRef.current ?? { w: v.videoWidth, h: v.videoHeight, x: 0, y: 0 };
        // source square = what LENS_PX on screen covers at h.mag, in video pixels
        const src = (LENS_PX / h.mag) * (p.w / h.rw);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, px, px);
        ctx.drawImage(v, p.x + h.u * p.w - src / 2, p.y + h.v * p.h - src / 2, src, src, 0, 0, px, px);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return (
    <canvas
      ref={canvas}
      width={LENS_PX * dpr}
      height={LENS_PX * dpr}
      className="h-full w-full"
      style={{ filter: filter || undefined, transform: lensTurn(hit) }}
    />
  );
}

/**
 * Key moments list: the official time-coded video description and/or the
 * AI-generated moments (records.ai_moments), with an Official | AI toggle when
 * both exist (choice remembered per browser). Click to seek; the moment under
 * the playhead is highlighted and kept in view while playing. Scrolls inside
 * its own box so long lists don't push the page.
 */
const SRC_KEY = "ru:moments-src";

export function KeyMoments({
  official,
  ai,
  videoRef,
  onSeek,
}: {
  official: KeyMoment[];
  ai: KeyMoment[];
  videoRef: RefObject<HTMLVideoElement | null>;
  onSeek: (t: number) => void;
}) {
  const [src, setSrc] = useState<"official" | "ai">(() => {
    try {
      return localStorage.getItem(SRC_KEY) === "ai" ? "ai" : "official";
    } catch {
      return "official";
    }
  });
  const both = official.length > 0 && ai.length > 0;
  const isAi = ai.length > 0 && (src === "ai" || official.length === 0);
  const moments = isAi ? ai : official;
  // two moments in one second (fleeting events) would both read "00:08": show tenths for the whole list
  const fine = moments.some((m, i) => i > 0 && Math.floor(m.start) === Math.floor(moments[i - 1].start));
  function choose(next: "official" | "ai") {
    setSrc(next);
    try {
      localStorage.setItem(SRC_KEY, next);
    } catch {
      /* private mode etc.: the choice lasts for this page only */
    }
  }
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = v.currentTime + 0.05;
      let i = -1;
      for (let k = 0; k < moments.length && moments[k].start <= t; k++) i = k;
      setActive(i);
    };
    onTime();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("seeked", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("seeked", onTime);
    };
  }, [videoRef, moments]);

  useEffect(() => {
    const box = list.current;
    const row = box?.children[active] as HTMLElement | undefined;
    if (box && row && !videoRef.current?.paused) box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: "smooth" });
  }, [active, videoRef]);

  return (
    <section aria-label="Key moments" className="mb-3.5 rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 pb-1.5 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="font-mono text-[10px] font-bold tracking-[.6px] text-signal">KEY MOMENTS</h2>
          {both && (
            <span className="flex gap-1">
              {(["official", "ai"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={(k === "ai") === isAi}
                  onClick={() => choose(k)}
                  className={`${chip} ${(k === "ai") === isAi ? on : off} px-[7px] py-[2px] text-[9px]`}
                >
                  {k === "ai" ? "AI" : "Official"}
                </button>
              ))}
            </span>
          )}
        </div>
        <span className={`font-mono text-[8.5px] ${isAi ? "text-amber" : "text-faint"}`}>
          {isAi ? "AI-generated from video frames · may be inaccurate" : "from the official video description"}
        </span>
      </div>
      <ol ref={list} className="relative max-h-[260px] overflow-y-auto px-1.5 pb-1.5">
        {moments.map((m, i) => (
          <li key={i}>
            <button
              type="button"
              aria-current={i === active ? "true" : undefined}
              onClick={() => onSeek(m.start)}
              className={`flex w-full gap-2.5 rounded-lg px-2 py-1.5 text-left active:scale-[.99] ${i === active ? "bg-[var(--signal-dim)]" : ""}`}
            >
              <span className={`flex-none pt-px font-mono text-[10.5px] tabular-nums ${i === active ? "text-signal" : "text-dim"}`}>
                <Play {...ico} size={10} className="mr-1 inline align-[-1px]" />
                {formatMoment(m.start, true).slice(0, fine ? 7 : 5)}
              </span>
              {isAi && (
                <span className="flex-none self-start rounded border border-amber px-1 font-mono text-[8px] leading-[14px] text-amber">
                  AI
                </span>
              )}
              <span className={`text-[12.5px] leading-[1.5] ${i === active ? "text-ink" : "text-dim"}`}>{m.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
