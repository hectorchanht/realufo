// Shorts player (/shorts/:id[?q=]): full-screen vertical scroll-snap list of the
// 9:16 Shorts we post to social, opened at :id. The slide ≥60% on screen plays;
// the URL follows it (replace) so the address bar is always the shareable Short.
// Queue = the ?q= search results when they contain :id, else every Short;
// pages load until :id turns up, and again as the viewer nears the end.
// One swipe (snap-stop) / ▲▼ button / arrow key = one Short. Tap a video (or
// Space) to pause/play; a bar along its bottom shows progress and seeks.
// Starts muted (autoplay policy); the sound button toggles all.
// Portaled to <body> with the app behind it made inert, so Tab/screen readers
// stay in the player.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Pause, Play, Share2, Volume2, VolumeX } from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useShorts } from "../api/queries";
import { goBack } from "../components/navItems";
import { docTitleParts } from "../lib/docTitle";
import { shareLink } from "../lib/shareLink";
import { useAutoplayInView } from "../lib/useAutoplayInView";
import { useSetPageTitle } from "../lib/pageTitle";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Progress bar along a Short's bottom edge: fills as it plays (every frame
// while playing), tap/drag to seek (paused while dragging), ←/→ = 5 s.
// Finds its slide's <video> itself.
function Seek() {
  const ref = useRef<HTMLDivElement>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [t, setT] = useState({ at: 0, dur: 0 });
  const [drag, setDrag] = useState(false);
  const resume = useRef(false);
  useEffect(() => setVideo(ref.current?.closest("section")?.querySelector("video") ?? null), []);
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const tick = () => {
      setT({ at: video.currentTime, dur: Number.isFinite(video.duration) ? video.duration : 0 });
      if (!video.paused) raf = requestAnimationFrame(tick);
    };
    const kick = () => {
      cancelAnimationFrame(raf);
      tick();
    };
    const evs = ["play", "pause", "timeupdate", "seeked", "loadedmetadata"];
    evs.forEach((e) => video.addEventListener(e, kick));
    return () => {
      cancelAnimationFrame(raf);
      evs.forEach((e) => video.removeEventListener(e, kick));
    };
  }, [video]);

  const seek = (to: number) => {
    if (!video || !t.dur) return;
    video.currentTime = Math.min(t.dur, Math.max(0, to));
    setT({ at: video.currentTime, dur: t.dur });
  };
  const seekX = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    if (r.width) seek(((e.clientX - r.left) / r.width) * t.dur);
  };
  const end = () => {
    if (!drag) return;
    setDrag(false);
    if (resume.current) video?.play().catch(() => {});
  };
  const pct = t.dur ? (t.at / t.dur) * 100 : 0;
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(t.dur)}
      aria-valuenow={Math.round(t.at)}
      aria-valuetext={`${clock(t.at)} of ${clock(t.dur)}`}
      onPointerDown={(e) => {
        if (!video) return;
        ref.current?.setPointerCapture?.(e.pointerId);
        resume.current = !video.paused;
        video.pause();
        setDrag(true);
        seekX(e);
      }}
      onPointerMove={(e) => drag && seekX(e)}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e: ReactKeyboardEvent) => {
        const step = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
        if (!step) return;
        e.preventDefault();
        seek(t.at + step);
      }}
      className="absolute inset-x-0 bottom-0 z-10 flex h-5 cursor-pointer touch-none items-end outline-none focus-visible:ring-2 focus-visible:ring-signal"
    >
      <div className={`w-full bg-white/25 transition-[height] ${drag ? "h-[6px]" : "h-[3px]"}`}>
        <div className="h-full bg-signal" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const path = (id: string, q: string) => `/shorts/${encodeURIComponent(id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;

export default function Shorts() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const searched = useShorts(q, { enabled: !!q });
  const inQ = !!searched.data?.some((s) => s.id === id);
  // The search is "done" once :id is in it or it has no more pages.
  const searchDone = !q || (searched.isFetched && (inQ || !searched.hasNextPage));
  const all = useShorts("", { enabled: searchDone && !inQ });
  const queue = inQ ? searched : all;
  const shorts = queue.data;
  const hunting = !shorts?.some((s) => s.id === id) && !!queue.hasNextPage;
  const pending = !searchDone || (!inQ && (!all.isFetched || hunting));
  const more = (src: typeof queue) => {
    if (src.hasNextPage && !src.isFetchingNextPage) src.fetchNextPage();
  };
  // Deep link past the loaded pages: keep paging until :id shows up (or pages run out).
  useEffect(() => {
    if (q && searched.isFetched && !inQ && searched.hasNextPage) more(searched);
    else if (searchDone && !inQ && all.isFetched && hunting) more(all);
  });

  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState("");
  // Big ▶ / ❚❚ flashed mid-slide after a tap toggles play.
  const [flash, setFlash] = useState<{ id: string; playing: boolean; n: number } | null>(null);
  const toggle = (v: HTMLVideoElement) => {
    const playing = v.paused;
    if (playing) v.play().catch(() => {});
    else v.pause();
    setFlash((f) => ({ id: v.dataset.id ?? "", playing, n: (f?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(h);
  }, [flash]);
  const step = (n: number) => root?.scrollBy?.({ top: n * root.clientHeight, behavior: "smooth" });
  const opened = useRef(false);
  const idx = shorts?.findIndex((s) => s.id === id) ?? -1;
  const found = idx >= 0;
  useSetPageTitle("SHORTS", "Declassified UAP clips", found ? docTitleParts(id, shorts![idx].title, "video").title : undefined);

  // Everything else on the page (the app under the overlay) is inert while open.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!layer) return;
    const others = [...document.body.children].filter((c) => c !== layer && !c.hasAttribute("inert"));
    others.forEach((c) => c.setAttribute("inert", ""));
    return () => others.forEach((c) => c.removeAttribute("inert"));
  }, [layer]);

  // Open on :id once; later :id changes come from scrolling, not navigation.
  useLayoutEffect(() => {
    if (opened.current || !root) return;
    opened.current = true;
    root.children[idx]?.scrollIntoView?.({ block: "start" });
  }, [root, idx]);

  useAutoplayInView(root, [shorts], (v) => {
    const sid = v.dataset.id;
    const at = shorts?.findIndex((s) => s.id === sid) ?? -1;
    if (at >= (shorts?.length ?? 0) - 3) more(queue);
    if (opened.current && sid && sid !== id) navigate(path(sid, inQ ? q : ""), { replace: true });
  });

  useEffect(() => {
    root?.querySelectorAll("video").forEach((v) => (v.muted = muted));
  }, [muted, root]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const n = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
      if (n) {
        e.preventDefault();
        step(n);
      } else if (e.key === " " && !(e.target as HTMLElement)?.closest?.("button,a,[role=slider]")) {
        const v = [...(root?.querySelectorAll("video") ?? [])].find((x) => x.dataset.id === id);
        if (v) {
          e.preventDefault();
          toggle(v);
        }
      } else if (e.key === "Escape") goBack(navigate, pathname);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const round = "grid h-11 w-11 place-items-center rounded-full text-white";
  const back = (
    <button type="button" aria-label="Back" title="Back" onClick={() => goBack(navigate, pathname)} className={`absolute left-3 top-3 z-20 bg-black/50 ${round}`}>
      <ArrowLeft size={22} aria-hidden="true" />
    </button>
  );

  return createPortal(
    <div ref={setLayer} data-screen="shorts" className="fixed inset-0 z-[60] bg-black">
      {back}
      {/* Mouse users get ▲▼; touch screens swipe. */}
      {found && !pending && (
        <div className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-3 [@media(hover:hover)]:flex">
          <button type="button" aria-label="Previous Short" title="Previous" className={`bg-white/15 hover:bg-white/25 ${round}`} onClick={() => step(-1)}>
            <ChevronUp size={22} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next Short" title="Next" className={`bg-white/15 hover:bg-white/25 ${round}`} onClick={() => step(1)}>
            <ChevronDown size={22} aria-hidden="true" />
          </button>
        </div>
      )}
      {pending ? (
        <div className="grid h-full place-items-center font-mono text-[11px] text-white/60">◉ loading signal…</div>
      ) : !found ? (
        <div className="grid h-full place-items-center px-6 text-center font-mono text-[12px] text-white/70">
          <div>
            Short not found.
            <br />
            <Link to={`/doc/${encodeURIComponent(id)}`} className="text-signal">open the file ›</Link>
          </div>
        </div>
      ) : (
        <div ref={setRoot} data-scroll className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
          {shorts!.map((s, i) => {
            const title = docTitleParts(s.id, s.title, "video").title;
            const MuteIcon = muted ? VolumeX : Volume2;
            const ShareIcon = copied === s.id ? Check : Share2;
            return (
              <section key={s.id} className="flex h-[100dvh] snap-start snap-always items-center justify-center">
                {/* 9:16 box: full screen on a phone, a centered column on desktop. */}
                <div className="relative aspect-[9/16] h-full max-w-full">
                  <video
                    data-testid="short-video"
                    data-id={s.id}
                    src={s.clip}
                    poster={s.thumb ?? undefined}
                    muted={muted}
                    loop
                    playsInline
                    preload={i === idx || i === idx + 1 ? "metadata" : "none"}
                    onClick={(e) => toggle(e.currentTarget)}
                    // autoplay may force a slide back to muted (useAutoplayInView): keep the button honest
                    onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
                    className="h-full w-full object-contain"
                  />
                  {flash?.id === s.id && (
                    <div key={flash.n} aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="grid h-16 w-16 place-items-center rounded-full bg-black/50 text-white animate-[fadeup_.6s_ease_reverse_both]">
                        {flash.playing ? <Play size={30} fill="currentColor" /> : <Pause size={30} fill="currentColor" />}
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}
                    className={`absolute right-3 top-3 bg-black/50 ${round}`}>
                    <MuteIcon size={20} aria-hidden="true" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-10 text-white">
                    {/* The id + title is the way to the file. */}
                    <Link to={`/doc/${encodeURIComponent(s.id)}`} title="View file" className="-mx-2 min-w-0 flex-1 rounded-lg px-2 py-1 hover:bg-white/10">
                      <span className="block font-mono text-[10px] uppercase tracking-[.8px] text-white/60">{s.id}</span>
                      <span className="line-clamp-2 text-[14px] font-semibold">{title}</span>
                    </Link>
                    <div className="flex flex-none flex-col gap-3">
                      <button type="button" aria-label={copied === s.id ? "Link copied" : "Share"} title="Share" className={`bg-white/15 ${round}`}
                        onClick={async () => setCopied((await shareLink(title, path(s.id, ""))) === "copied" ? s.id : "")}>
                        <ShareIcon size={20} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <Seek />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}
