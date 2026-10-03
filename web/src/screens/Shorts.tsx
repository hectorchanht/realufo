// Shorts player (/shorts/:id[?q=]): full-screen vertical scroll-snap list of the
// 9:16 Shorts we post to social, opened at :id. The slide ≥60% on screen plays;
// the URL follows it (replace) so the address bar is always the shareable Short.
// Queue = the ?q= search results when they contain :id, else every Short.
// Starts muted (autoplay policy); the sound button / tapping a video toggles all.
// Portaled to <body> with the app behind it made inert, so Tab/screen readers
// stay in the player.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useShorts } from "../api/queries";
import { goBack } from "../components/navItems";
import { docTitleParts } from "../lib/docTitle";
import { shareLink } from "../lib/shareLink";
import { useAutoplayInView } from "../lib/useAutoplayInView";
import { useSetPageTitle } from "../lib/pageTitle";

const path = (id: string, q: string) => `/shorts/${encodeURIComponent(id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;

export default function Shorts() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const searched = useShorts(q, { enabled: !!q });
  const inQ = !!searched.data?.some((s) => s.id === id);
  const all = useShorts("", { enabled: !q || (searched.isFetched && !inQ) });
  const shorts = inQ ? searched.data! : all.data;
  const pending = (q && !searched.isFetched) || (!inQ && !all.isFetched);

  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState("");
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
    if (opened.current && sid && sid !== id) navigate(path(sid, inQ ? q : ""), { replace: true });
  });

  useEffect(() => {
    root?.querySelectorAll("video").forEach((v) => (v.muted = muted));
  }, [muted, root]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
      if (step) {
        e.preventDefault();
        root?.scrollBy?.({ top: step * root.clientHeight, behavior: "smooth" });
      } else if (e.key === "Escape") goBack(navigate, pathname);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, pathname, root]);

  const back = (
    <button type="button" onClick={() => goBack(navigate, pathname)}
      className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[13px] text-white">
      ‹ Back
    </button>
  );

  return createPortal(
    <div ref={setLayer} data-screen="shorts" className="fixed inset-0 z-[60] bg-black">
      {back}
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
            return (
              <section key={s.id} className="relative flex h-[100dvh] snap-start items-center justify-center">
                <video
                  data-testid="short-video"
                  data-id={s.id}
                  src={s.clip}
                  poster={s.thumb ?? undefined}
                  muted={muted}
                  loop
                  playsInline
                  preload={i === idx || i === idx + 1 ? "metadata" : "none"}
                  onClick={() => setMuted((m) => !m)}
                  // autoplay may force a slide back to muted (useAutoplayInView): keep the button honest
                  onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
                  className="aspect-[9/16] h-full max-w-full object-contain"
                />
                <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}
                  className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-[15px] text-white">
                  {muted ? "🔇" : "🔊"}
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-10 text-white">
                  <div className="font-mono text-[10px] uppercase tracking-[.8px] text-white/60">{s.id}</div>
                  <div className="mb-3 line-clamp-2 text-[14px] font-semibold">{title}</div>
                  <div className="flex gap-2">
                    <Link to={`/doc/${encodeURIComponent(s.id)}`} className="rounded-full bg-white px-3.5 py-1.5 font-mono text-[11px] text-black">
                      View file ›
                    </Link>
                    <button type="button"
                      onClick={async () => setCopied((await shareLink(title, path(s.id, ""))) === "copied" ? s.id : "")}
                      className="rounded-full border border-white/40 px-3.5 py-1.5 font-mono text-[11px]">
                      {copied === s.id ? "Link copied" : "Share"}
                    </button>
                  </div>
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
