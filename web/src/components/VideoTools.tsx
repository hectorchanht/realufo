// Video analysis tools for the Doc media panel, uapbrowser-style: frame
// step, timecode, speed, loop / loop A–B, mute, capture frame, and a zoom
// lens. Adjust filters + presets come from ImageTools (ImageToolbar).
//
// Playback stays on the CDN <video>. Its responses are cached without CORS
// headers, so the canvas is tainted: fine for the lens (drawing only), but
// capture can't read pixels from it. Capture instead seeks a hidden copy of
// the same file through our same-origin /api/file/:id route.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { LENS_PX, LENS_ZOOM, LensLayer, chip, off, on } from "./ImageTools";
import type { LensHit } from "./ImageTools";

// ponytail: fixed 30 fps (the DoD clips are ~29.97/30); read the real rate via
// requestVideoFrameCallback if frame-exact stepping ever matters.
const FPS = 30;
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];

// currentTime lands a hair under k/FPS (0.066666 × 30 = 1.99998), so nudge before flooring
const frameOf = (t: number) => Math.floor(t * FPS + 0.01);

function timecode(t: number) {
  const n = frameOf(t);
  const m = Math.floor(n / FPS / 60);
  const s = Math.floor(n / FPS) % 60;
  const f = n % FPS;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
}

/** Seek a hidden same-origin copy of the file to `time` and encode that frame as PNG. */
function grabFrame(src: string, time: number, filter: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("load failed"));
    // seeking to the current position fires no `seeked`, so never seek to exactly 0
    v.onloadedmetadata = () => (v.currentTime = Math.max(time, 0.001));
    v.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.filter = filter || "none"; // ignored by Safari < 18 → unfiltered capture
      ctx.drawImage(v, 0, 0);
      v.removeAttribute("src");
      v.load();
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png");
    };
    v.src = src;
  });
}

export function VideoTransport({
  videoRef,
  fileUrl,
  name,
  filter,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  fileUrl: string; // same-origin copy for capture
  name: string; // capture file name prefix
  filter: string;
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
    const onMeta = () => setDur(Number.isFinite(v.duration) ? v.duration : 0);
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
  }, [videoRef]);

  const v = () => videoRef.current;

  function step(dir: number) {
    const el = v();
    if (!el) return;
    el.pause();
    el.currentTime = Math.min(Math.max(el.currentTime + dir / FPS, 0), el.duration || Infinity);
    setT(el.currentTime);
  }

  function markAb() {
    const now = v()?.currentTime ?? 0;
    if (!ab) setAb({ a: now });
    else if (ab.b === undefined && now > ab.a) setAb({ ...ab, b: now });
    else setAb(null);
  }

  async function grab() {
    const el = v();
    if (!el || capture === "busy") return;
    setCapture("busy");
    try {
      const blob = await grabFrame(fileUrl, el.currentTime, filter);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}_${timecode(el.currentTime).replace(/[:.]/g, "-")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setCapture("idle");
    } catch {
      setCapture("failed");
    }
  }

  const abLabel = !ab ? "A–B" : ab.b === undefined ? "set B" : "A–B ✕";

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => {
          const el = v();
          if (!el) return;
          if (el.paused) el.play().catch(() => {});
          else el.pause();
        }}
        className={`${chip} ${off} w-8`}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <button type="button" aria-label="Previous frame" onClick={() => step(-1)} className={`${chip} ${off}`}>
        ◁
      </button>
      <button type="button" aria-label="Next frame" onClick={() => step(1)} className={`${chip} ${off}`}>
        ▷
      </button>
      <span className="font-mono text-[10px] tabular-nums text-dim">
        {timecode(t)} / {timecode(dur)} <span className="text-faint">F{frameOf(t)}</span>
      </span>
      <button
        type="button"
        aria-label="Loop A–B"
        aria-pressed={ab?.b !== undefined}
        onClick={markAb}
        className={`${chip} ${ab ? on : off}`}
      >
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
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={muted}
        onClick={() => {
          const el = v();
          if (el) el.muted = !muted;
          setMuted(!muted);
        }}
        className={`${chip} ${muted ? on : off}`}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <span className="flex flex-wrap gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={rate === s}
            onClick={() => {
              const el = v();
              if (el) el.playbackRate = s;
              setRate(s);
            }}
            className={`${chip} ${rate === s ? on : off}`}
          >
            {s}×
          </button>
        ))}
      </span>
      <button type="button" onClick={grab} disabled={capture === "busy"} className={`${chip} ${off} ml-auto`}>
        {capture === "busy" ? "capturing…" : capture === "failed" ? "⤓ capture failed — retry" : "⤓ Capture frame"}
      </button>
    </div>
  );
}

/** Video lens: redraws the zoomed region every frame, so it tracks playback. */
export function VideoLens({
  videoRef,
  filter,
  clickThrough,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  filter: string;
  clickThrough: boolean;
}) {
  return (
    <LensLayer
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

function LensCanvas({
  videoRef,
  hit,
  filter,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  hit: LensHit;
  filter: string;
}) {
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
        // source square = what LENS_PX on screen covers at LENS_ZOOM, in video pixels
        const src = (LENS_PX / LENS_ZOOM) * (v.videoWidth / h.rw);
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
      style={{ filter: filter || undefined }}
    />
  );
}
