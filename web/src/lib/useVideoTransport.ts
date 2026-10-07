// Video playback state, lifted out of VideoTransport so the transport row
// and the media console (DJ deck / Walkman press points, cassette window)
// drive the same state. Spec:
// docs/superpowers/specs/2026-10-04-media-dj-console-design.md
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { renderPng } from "../components/ImageTools";
import type { MediaView } from "./mediaView";
import { formatMoment } from "./recordMedia";
import type { VideoCrop } from "./recordMedia";

// ponytail: fixed 30 fps (the DoD clips are ~29.97/30); read the real rate via
// requestVideoFrameCallback if frame-exact stepping ever matters.
export const FPS = 30;
export const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2];

// currentTime lands a hair under k/FPS (0.066666 × 30 = 1.99998), so nudge before flooring
export const frameOf = (t: number) => Math.floor(t * FPS + 0.01);

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

export interface VideoTransportOptions {
  filter: string;
  view: MediaView;
  crop: VideoCrop | null; // saved frames drop the black bars too
  fileUrl: string; // same-origin copy for capture
  name: string; // capture file name prefix
  startAt?: number; // seconds (?t=)
  /** The media panel: fullscreened whole so filters, zoom and the lens come along. */
  stage?: HTMLElement | null;
  onPost: (frame: File, t: number) => void;
}

export interface VideoCtl {
  t: number;
  dur: number;
  playing: boolean;
  rate: number;
  loop: boolean;
  muted: boolean;
  ab: { a: number; b?: number } | null;
  capture: "idle" | "busy" | "failed";
  full: boolean;
  frame: number;
  abLabel: string;
  /** The playhead right now, read off the element (state `t` lags a frame). */
  now(): number;
  togglePlay(): void;
  stepFrame(dir: 1 | -1): void;
  seek(t: number): void;
  setRate(s: number): void;
  cycleRate(): void;
  toggleLoop(): void;
  markAb(): void;
  toggleMute(): void;
  toggleFull(): void;
  download(): void;
  grab(then: "save" | "post"): Promise<void>;
}

/**
 * Owns the video element's playback state. Pass null options (images, PDFs)
 * and every effect no-ops; the hook returns null.
 */
export function useVideoTransport(videoRef: RefObject<HTMLVideoElement | null>, opts: VideoTransportOptions | null): VideoCtl | null {
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setPlaybackRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ab, setAb] = useState<{ a: number; b?: number } | null>(null);
  const [capture, setCapture] = useState<"idle" | "busy" | "failed">("idle");
  const [full, setFull] = useState(false);
  const abRef = useRef(ab);
  useEffect(() => {
    abRef.current = ab;
  }, [ab]);

  const live = opts !== null;
  const startAt = opts?.startAt;
  const stage = opts?.stage;
  const crop = opts?.crop ?? null;
  const fileUrl = opts?.fileUrl ?? "";
  const name = opts?.name ?? "";
  const filter = opts?.filter ?? "";
  const view = opts?.view;
  const onPost = opts?.onPost;

  useEffect(() => {
    if (!live) return;
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
    const onRate = () => setPlaybackRate(v.playbackRate);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoRef, live, startAt]);

  useEffect(() => {
    if (!live) return;
    const onFs = () => setFull(!!stage && document.fullscreenElement === stage);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [live, stage]);

  if (!live) return null;

  const v = () => videoRef.current;

  function togglePlay() {
    const el = v();
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  function stepFrame(dir: 1 | -1) {
    const el = v();
    if (!el) return;
    el.pause();
    const nt = Math.min(Math.max(el.currentTime + dir / FPS, 0), el.duration || Infinity);
    el.currentTime = nt;
    setT(nt);
  }

  function seek(nt: number) {
    const el = v();
    if (el) el.currentTime = nt;
    setT(nt);
  }

  function setRate(s: number) {
    const el = v();
    if (el) el.playbackRate = s;
    setPlaybackRate(s);
  }

  function cycleRate() {
    setRate(SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]);
  }

  function toggleLoop() {
    const el = v();
    if (el) el.loop = !loop;
    setLoop(!loop);
  }

  function toggleMute() {
    const el = v();
    if (el) el.muted = !muted;
    setMuted(!muted);
  }

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
      const blob = await grabFrame(fileUrl, at, filter, view!, crop);
      const fileName = `${name}_${formatMoment(at).replace(/[:.]/g, "-")}.png`;
      if (then === "post") onPost!(new File([blob], fileName, { type: "image/png" }), at);
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

  const abLabel = `Loop A–B: ${!ab ? "set A" : ab.b === undefined ? "set B" : "clear"}`;

  return {
    t, dur, playing, rate, loop, muted, ab, capture, full,
    frame: frameOf(t),
    abLabel,
    now: () => v()?.currentTime ?? t,
    togglePlay, stepFrame, seek, setRate, cycleRate, toggleLoop, markAb, toggleMute, toggleFull, download, grab,
  };
}
