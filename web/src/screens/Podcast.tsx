// /podcast — "RealUFO Case Files": the weekly case file in audio.
// Same case as the Friday email — listen or read, your pick.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSetPageTitle } from "../lib/pageTitle";
import { api } from "../api/client";

interface Episode {
  guid: string;
  title: string;
  description: string;
  pubDate: string;
  audioUrl: string;
  durationSecs: number;
  caseSlug: string;
}

const FEED_URL =
  "https://muse.ai/podcasts/feed/1461294037066935/18ab475f-d21a-4364-ac78-db38e8876b94";

const fmtDur = (s: number) =>
  s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";

export default function Podcast() {
  useSetPageTitle("PODCAST", "One declassified case file every week, in audio");
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<{ episodes: Episode[] }>("/api/podcast/episodes")
      .then((r) => setEpisodes(r.episodes))
      .catch(() => setEpisodes([]));
  }, []);

  const copyFeed = async () => {
    try {
      await navigator.clipboard.writeText(FEED_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div data-screen="podcast" className="mx-auto max-w-[720px]">
      <h1 className="font-mono text-[15px] font-bold text-ink">THE PODCAST</h1>
      <p className="mb-4 mt-1 text-[13.5px] leading-[1.6] text-dim">
        RealUFO Case Files — one declassified UFO case file every week in audio,
        researched from the primary documents, every claim cited. Same case as
        the Friday email — listen or read, your pick.
      </p>

      <h2 className="mb-2 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        SUBSCRIBE
      </h2>
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={copyFeed}
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-signal hover:underline"
        >
          {copied ? "Copied!" : "Copy RSS feed"}
        </button>
        <a
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-signal hover:underline"
          href={`overcast://x-callback-url/add?url=${encodeURIComponent(FEED_URL)}`}
        >
          Overcast
        </a>
        <a
          className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-signal hover:underline"
          href={`pktc://subscribe/${FEED_URL.replace(/^https?:\/\//, "")}`}
        >
          Pocket Casts
        </a>
        <span className="px-1 py-1.5 text-[12px] text-faint">
          Apple Podcasts, Spotify &amp; YouTube coming soon
        </span>
      </div>

      <h2 className="mb-2 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        EPISODES
      </h2>
      {episodes === null ? (
        <p className="text-[13px] text-dim">Loading…</p>
      ) : episodes.length === 0 ? (
        <p className="text-[13px] text-dim">
          No episodes yet — the first one drops with this Friday's case file.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {episodes.map((ep) => (
            <li key={ep.guid} className="rounded-lg border border-line p-3">
              <div className="text-[14px] font-bold text-ink">{ep.title}</div>
              <div className="mt-0.5 font-mono text-[11px] text-faint">
                {ep.pubDate}
                {ep.durationSecs > 0 ? ` · ${fmtDur(ep.durationSecs)}` : ""}
              </div>
              <p className="mt-1 text-[13px] leading-[1.55] text-dim">
                {ep.description}
              </p>
              <audio controls preload="none" src={ep.audioUrl} className="mt-2 w-full" />
              {ep.caseSlug && (
                <Link
                  to={`/case/${ep.caseSlug}`}
                  className="mt-1 inline-block text-[13px] text-signal hover:underline"
                >
                  Read the case file →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
