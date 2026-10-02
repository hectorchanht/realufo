// Video analysis tools for the Doc media panel, uapbrowser-style: frame
// step, timecode, speed, loop / loop A–B, mute, keyboard shortcuts, capture
// frame (save, or post to the discussion), link to the current moment, and a
// zoom lens. Adjust filters / palettes / rotate come from ImageTools.
//
// Playback stays on the CDN <video>. Its responses are cached without CORS
// headers, so the canvas is tainted: fine for the lens (drawing only), but
// capture can't read pixels from it. Capture instead seeks a hidden copy of
// the same file through our same-origin /api/file/:id route.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { LENS_PX, LensLayer, chip, lensTurn, off, on } from "./ImageTools";
import type { LensHit } from "./ImageTools";
import type { MediaView } from "../lib/mediaView";
import { formatMoment } from "../lib/recordMedia";
import type { KeyMoment } from "../lib/keyMoments";

// ponytail: fixed 30 fps (the DoD clips are ~29.97/30); read the real rate via
// requestVideoFrameCallback if frame-exact stepping ever matters.
const FPS = 30;
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];

// currentTime lands a hair under k/FPS (0.066666 × 30 = 1.99998), so nudge before flooring
const frameOf = (t: number) => Math.floor(t * FPS + 0.01);

/** Seek a hidden same-origin copy of the file to `time` and encode that frame (filter, rotate, flip applied) as PNG. */
function grabFrame(src: string, time: number, filter: string, view: MediaView): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("load failed"));
    // seeking to the current position fires no `seeked`, so never seek to exactly 0
    v.onloadedmetadata = () => (v.currentTime = Math.max(time, 0.001));
    v.onseeked = () => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      const c = document.createElement("canvas");
      [c.width, c.height] = view.rot % 180 ? [h, w] : [w, h];
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.filter = filter || "none"; // ignored by Safari < 18 → unfiltered capture
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((view.rot * Math.PI) / 180);
      if (view.flip) ctx.scale(-1, 1);
      ctx.drawImage(v, -w / 2, -h / 2);
      v.removeAttribute("src");
      v.load();
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
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
  fileUrl,
  name,
  filter,
  view,
  startAt,
  keys,
  onShare,
  onPost,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  fileUrl: string; // same-origin copy for capture
  name: string; // capture file name prefix
  filter: string;
  view: MediaView;
  startAt?: number; // seconds (?t=)
  keys: boolean; // keyboard shortcuts live (off while an overlay is open)
  onShare: (t: number) => void;
  onPost: (frame: File, t: number) => void;
}) {
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ab, setAb] = useState<{ a: number; b?: number } | null>(null);
  const [capture, setCapture] = useState<"idle" | "busy" | "failed">("idle");
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
      const blob = await grabFrame(fileUrl, at, filter, view);
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

  const abLabel = !ab ? "A–B" : ab.b === undefined ? "set B" : "A–B ✕";

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
      <button type="button" aria-label={playing ? "Pause" : "Play"} title="Space" onClick={togglePlay} className={`${chip} ${off} w-8`}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button type="button" aria-label="Previous frame" title="," onClick={() => step(-1)} className={`${chip} ${off}`}>
        ◁
      </button>
      <button type="button" aria-label="Next frame" title="." onClick={() => step(1)} className={`${chip} ${off}`}>
        ▷
      </button>
      <span className="font-mono text-[10px] tabular-nums text-dim">
        {formatMoment(t, true)} / {formatMoment(dur, true)} <span className="text-faint">F{frameOf(t)}</span>
      </span>
      <button type="button" aria-label="Loop A–B" aria-pressed={ab?.b !== undefined} title="A" onClick={markAb} className={`${chip} ${ab ? on : off}`}>
        {abLabel}
      </button>
      <button
        type="button"
        aria-pressed={loop}
        onClick={() => {
          const el = v();
          if (el) el.loop = !loop;
          setLoop(!loop);
        }}
        className={`${chip} ${loop ? on : off}`}
      >
        Loop
      </button>
      <button type="button" aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted} title="M" onClick={toggleMute} className={`${chip} ${muted ? on : off}`}>
        {muted ? "🔇" : "🔊"}
      </button>
      <span className="flex flex-wrap gap-1">
        {SPEEDS.map((s) => (
          <button key={s} type="button" aria-pressed={rate === s} title="[ ]" onClick={() => speed(s)} className={`${chip} ${rate === s ? on : off}`}>
            {s}×
          </button>
        ))}
      </span>
      <span className="ml-auto flex flex-wrap gap-2">
        <button type="button" aria-label="Copy link to this moment" onClick={() => onShare(v()?.currentTime ?? t)} className={`${chip} ${off}`}>
          ⧉ Link @{formatMoment(t)}
        </button>
        <button type="button" aria-label="Capture frame" title="C" onClick={() => grab("save")} disabled={capture === "busy"} className={`${chip} ${off}`}>
          {capture === "busy" ? "capturing…" : capture === "failed" ? "⤓ failed — retry" : "⤓ Save frame"}
        </button>
        <button type="button" aria-label="Post frame to discussion" onClick={() => grab("post")} disabled={capture === "busy"} className={`${chip} ${off}`}>
          ✎ Post frame
        </button>
      </span>
    </div>
  );
}

/** Video lens: redraws the zoomed region every frame, so it tracks playback. */
export function VideoLens({
  videoRef,
  filter,
  view,
  mag,
  clickThrough,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
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
        return v?.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null;
      }}
    >
      {(hit) => <LensCanvas videoRef={videoRef} hit={hit} filter={filter} />}
    </LensLayer>
  );
}

function LensCanvas({ videoRef, hit, filter }: { videoRef: RefObject<HTMLVideoElement | null>; hit: LensHit; filter: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hitRef = useRef(hit);
  useEffect(() => {
    hitRef.current = hit;
  }, [hit]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const v = videoRef.current;
      const ctx = canvas.current?.getContext("2d");
      const h = hitRef.current;
      if (v?.videoWidth && ctx) {
        const px = ctx.canvas.width;
        // source square = what LENS_PX on screen covers at h.mag, in video pixels
        const src = (LENS_PX / h.mag) * (v.videoWidth / h.rw);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, px, px);
        ctx.drawImage(v, h.u * v.videoWidth - src / 2, h.v * v.videoHeight - src / 2, src, src, 0, 0, px, px);
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
 * Key moments list (from the official time-coded video description): click to
 * seek; the moment under the playhead is highlighted and kept in view while
 * playing. Scrolls inside its own box so long lists don't push the page.
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
                ▶ {formatMoment(m.start, true).slice(0, 5)}
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
