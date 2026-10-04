// Video analysis tools for the Doc media panel, uapbrowser-style: frame
// step, timecode, speed, loop / loop A–B, mute, full screen, download, keyboard shortcuts, capture
// frame (save, or post to the discussion), link to the current moment, and a
// zoom lens. Adjust filters / palettes / rotate come from ImageTools.
//
// Playback stays on the CDN <video>. Its responses are cached without CORS
// headers, so the canvas is tainted: fine for the lens (drawing only), but
// capture can't read pixels from it. Capture instead seeks a hidden copy of
// the same file through our same-origin /api/file/:id route.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { Camera, Download, Link, LoaderCircle, Maximize, MessageSquarePlus, Minimize, Pause, Play, Repeat, Repeat1, StepBack, StepForward, TriangleAlert, Volume2, VolumeX, X } from "lucide-react";
import { LENS_PX, LensLayer, chip, ico, lensTurn, off, on, renderPng } from "./ImageTools";
import type { LensHit } from "./ImageTools";
import type { MediaView } from "../lib/mediaView";
import { formatMoment } from "../lib/recordMedia";
import type { VideoCrop } from "../lib/recordMedia";
import type { KeyMoment } from "../lib/keyMoments";

// ponytail: fixed 30 fps (the DoD clips are ~29.97/30); read the real rate via
// requestVideoFrameCallback if frame-exact stepping ever matters.
const FPS = 30;
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];

// currentTime lands a hair under k/FPS (0.066666 × 30 = 1.99998), so nudge before flooring
const frameOf = (t: number) => Math.floor(t * FPS + 0.01);

/** Seek a hidden same-origin copy of the file to `time` and encode that frame (bars cropped, filter, rotate, flip applied) as PNG. */
function grabFrame(src: string, time: number, filter: string, view: MediaView, crop: VideoCrop | null): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("load failed"));
    // seeking to the current position fires no `seeked`, so never seek to exactly 0
    v.onloadedmetadata = () => (v.currentTime = Math.max(time, 0.001));
    v.onseeked = () => {
      const png = renderPng(v, crop ?? { w: v.videoWidth, h: v.videoHeight, x: 0, y: 0 }, filter, view); // draws now, encodes async
      v.removeAttribute("src");
      v.load();
      png.then(resolve, reject);
    };
    v.src = src;
  });
}

function isTyping() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function VideoTransport({
  videoRef,
  crop,
  fileUrl,
  name,
  filter,
  view,
  startAt,
  keys,
  onShare,
  onPost,
  speedSlot,
  stage,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  crop: VideoCrop | null; // saved frames drop the black bars too
  fileUrl: string; // same-origin copy for capture
  name: string; // capture file name prefix
  filter: string;
  view: MediaView;
  startAt?: number; // seconds (?t=)
  keys: boolean; // keyboard shortcuts live (off while an overlay is open)
  onShare: (t: number) => void;
  onPost: (frame: File, t: number) => void;
  /** Where speed + loop render (MediaToolbar's Adjust panel); null while it's closed. State stays here. */
  speedSlot?: HTMLElement | null;
  /** The media panel: fullscreened whole so filters, zoom and the lens come along. */
  stage?: HTMLElement | null;
}) {
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ab, setAb] = useState<{ a: number; b?: number } | null>(null);
  const [capture, setCapture] = useState<"idle" | "busy" | "failed">("idle");
  const [full, setFull] = useState(false);
  const abRef = useRef(ab);
  useEffect(() => {
    abRef.current = ab;
  }, [ab]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    // per-frame while playing: smooth timecode + tight A–B looping (timeupdate is only ~4 Hz)
    const tick = () => {
      const r = abRef.current;
      if (r?.b !== undefined && v.currentTime >= r.b) v.currentTime = r.a;
      setT(v.currentTime);
      if (!v.paused) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    const onTime = () => setT(v.currentTime);
    const onMeta = () => {
      setDur(Number.isFinite(v.duration) ? v.duration : 0);
      if (startAt && v.readyState >= 1 && v.currentTime === 0) v.currentTime = startAt;
    };
    const onRate = () => setRate(v.playbackRate);
    const onVol = () => setMuted(v.muted);
    const events: [string, () => void][] = [
      ["play", onPlay],
      ["pause", onPause],
      ["seeked", onTime],
      ["timeupdate", onTime],
      ["loadedmetadata", onMeta],
      ["ratechange", onRate],
      ["volumechange", onVol],
    ];
    events.forEach(([k, f]) => v.addEventListener(k, f));
    onMeta();
    onVol();
    if (!v.paused) onPlay(); // autoplay may have started before this effect attached
    return () => {
      cancelAnimationFrame(raf);
      events.forEach(([k, f]) => v.removeEventListener(k, f));
    };
  }, [videoRef, startAt]);

  const v = () => videoRef.current;

  function togglePlay() {
    const el = v();
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function step(dir: number) {
    const el = v();
    if (!el) return;
    el.pause();
    el.currentTime = Math.min(Math.max(el.currentTime + dir / FPS, 0), el.duration || Infinity);
    setT(el.currentTime);
  }

  function speed(s: number) {
    const el = v();
    if (el) el.playbackRate = s;
    setRate(s);
  }

  function toggleMute() {
    const el = v();
    if (el) el.muted = !muted;
    setMuted(!muted);
  }

  useEffect(() => {
    const onFs = () => setFull(!!stage && document.fullscreenElement === stage);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [stage]);

  function toggleFull() {
    if (document.fullscreenElement) return void document.exitFullscreen().catch(() => {});
    if (stage?.requestFullscreen) return void stage.requestFullscreen().catch(() => {});
    // iPhone Safari can't fullscreen a div, only the <video> itself (native player, no filters)
    (v() as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null)?.webkitEnterFullscreen?.();
  }

  function download() {
    // same-origin route, so `download` is honoured (ignored on the cross-origin CDN URL); extension from the CDN file
    const ext = /\.\w+$/.exec(new URL(v()?.currentSrc || "x:/", location.href).pathname)?.[0] ?? "";
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = name + ext;
    a.click();
  }

  function markAb() {
    const now = v()?.currentTime ?? 0;
    if (!ab) setAb({ a: now });
    else if (ab.b === undefined && now > ab.a) setAb({ ...ab, b: now });
    else setAb(null);
  }

  async function grab(then: "save" | "post") {
    const el = v();
    if (!el || capture === "busy") return;
    const at = el.currentTime;
    el.pause();
    setCapture("busy");
    try {
      const blob = await grabFrame(fileUrl, at, filter, view, crop);
      const fileName = `${name}_${formatMoment(at).replace(/[:.]/g, "-")}.png`;
      if (then === "post") onPost(new File([blob], fileName, { type: "image/png" }), at);
      else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      setCapture("idle");
    } catch {
      setCapture("failed");
    }
  }

  // Shortcuts (Doc owns ←/→ file nav, Esc, and the lens/filter/rotate keys).
  const act = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    act.current = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const k = e.key.toLowerCase();
      // a focused <video> already toggles on Space itself
      if ((k === " " && (document.activeElement as HTMLElement | null)?.tagName !== "VIDEO") || k === "k") togglePlay();
      else if (k === "," || k === ".") step(k === "," ? -1 : 1);
      else if (k === "[" || k === "]") speed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(rate) + (k === "[" ? -1 : 1)))]);
      else if (k === "a") markAb();
      else if (k === "m") toggleMute();
      else if (k === "c") void grab("save");
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

  const abLabel = `Loop A–B: ${!ab ? "set A" : ab.b === undefined ? "set B" : "clear"}`;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {/* own seek bar: the native controls hide while the video is zoomed/rotated */}
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={dur || 0}
        step={1 / FPS}
        value={Math.min(t, dur || 0)}
        onChange={(e) => {
          const el = v();
          if (el) el.currentTime = Number(e.target.value);
          setT(Number(e.target.value));
        }}
        className="w-full accent-[var(--signal)]"
      />
      <button type="button" aria-label={playing ? "Pause" : "Play"} title={`${playing ? "Pause" : "Play"} (Space)`} onClick={togglePlay} className={`${chip} ${off}`}>
        {playing ? <Pause {...ico} /> : <Play {...ico} />}
      </button>
      <span className="font-mono text-[10px] tabular-nums text-dim">
        {formatMoment(t, true)} / {formatMoment(dur, true)}
      </span>
      <button type="button" aria-label="Previous frame" title="Previous frame (,)" onClick={() => step(-1)} className={`${chip} ${off}`}>
        <StepBack {...ico} />
      </button>
      <span className="font-mono text-[10px] tabular-nums text-faint">F{frameOf(t)}</span>
      <button type="button" aria-label="Next frame" title="Next frame (.)" onClick={() => step(1)} className={`${chip} ${off}`}>
        <StepForward {...ico} />
      </button>
      <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} title={`${muted ? "Unmute" : "Mute"} (M)`} onClick={toggleMute} className={`${chip} ${muted ? on : off}`}>
        {muted ? <VolumeX {...ico} /> : <Volume2 {...ico} />}
      </button>
      <button type="button" aria-label={full ? "Exit full screen" : "Full screen"} aria-pressed={full} title={full ? "Exit full screen (Esc)" : "Full screen"} onClick={toggleFull} className={`${chip} ${full ? on : off}`}>
        {full ? <Minimize {...ico} /> : <Maximize {...ico} />}
      </button>
      <button type="button" aria-label="Download video" title="Download video" onClick={download} className={`${chip} ${off}`}>
        <Download {...ico} />
      </button>
      {speedSlot &&
        createPortal(
          <>
            {SPEEDS.map((s) => (
              <button key={s} type="button" aria-pressed={rate === s} title="Speed ([ ])" onClick={() => speed(s)} className={`${chip} ${rate === s ? on : off}`}>
                {s}×
              </button>
            ))}
            <button
              type="button"
              aria-label="Loop"
              aria-pressed={loop}
              title="Loop"
              onClick={() => {
                const el = v();
                if (el) el.loop = !loop;
                setLoop(!loop);
              }}
              className={`${chip} ${loop ? on : off}`}
            >
              <Repeat {...ico} />
            </button>
            <button type="button" aria-label={abLabel} aria-pressed={ab?.b !== undefined} title={`${abLabel} (A)`} onClick={markAb} className={`${chip} ${ab ? on : off}`}>
              <Repeat1 {...ico} />
              {ab && (ab.b === undefined ? "B?" : <X {...ico} size={12} />)}
            </button>
          </>,
          speedSlot,
        )}
      <span className="ml-auto flex flex-wrap gap-2">
        <button
          type="button"
          aria-label="Copy link to this moment"
          title={`Copy link @${formatMoment(t)}`}
          onClick={() => onShare(v()?.currentTime ?? t)}
          className={`${chip} ${off}`}
        >
          <Link {...ico} />
        </button>
        <button
          type="button"
          aria-label={capture === "failed" ? "Capture failed, retry" : "Capture frame"}
          title={capture === "failed" ? "Capture failed — retry (C)" : "Save frame (C)"}
          onClick={() => grab("save")}
          disabled={capture === "busy"}
          className={`${chip} ${capture === "failed" ? "border-amber text-amber" : off}`}
        >
          {capture === "busy" ? <LoaderCircle {...ico} className="animate-spin" /> : capture === "failed" ? <TriangleAlert {...ico} /> : <Camera {...ico} />}
        </button>
        <button
          type="button"
          aria-label="Post frame to discussion"
          title="Post frame to discussion"
          onClick={() => grab("post")}
          disabled={capture === "busy"}
          className={`${chip} ${off}`}
        >
          <MessageSquarePlus {...ico} />
        </button>
      </span>
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
                {formatMoment(m.start, true).slice(0, 5)}
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
