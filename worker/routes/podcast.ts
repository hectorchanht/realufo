// "RealUFO Case Files" podcast — episode list parsed from the public RSS feed.
// The feed is the source of truth (podcast directories consume it); the parse
// is cached for an hour per colo so /podcast and /api/podcast/episodes stay cheap.
import { cachedJson } from "../lib/cache";
import { json } from "../lib/json";

export const PODCAST_FEED_URL =
  "https://muse.ai/podcasts/feed/1461294037066935/18ab475f-d21a-4364-ac78-db38e8876b94";

export interface PodcastEpisode {
  guid: string;
  title: string;
  description: string;
  pubDate: string; // YYYY-MM-DD
  audioUrl: string;
  durationSecs: number;
  caseSlug: string; // "" when unknown — link to /case/:slug when known
}

// Episode guid → case slug. The feed itself carries no case slug, so this map
// is updated (one line per episode) when each episode is approved for publish.
const EPISODE_CASE_SLUG: Record<string, string> = {
  "ep-01658671-5677-4bd6-8d8c-5ba9477fe5ea": "roswell",
};

const unesc = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();

export function parsePodcastFeed(xml: string): PodcastEpisode[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const eps: PodcastEpisode[] = [];
  for (const it of items) {
    const pick = (re: RegExp) => {
      const m = it.match(re);
      return m ? unesc(m[1]) : "";
    };
    const audioUrl = pick(/<enclosure[^>]*url="([^"]+)"/);
    if (!audioUrl) continue;
    const guid = pick(/<guid[^>]*>([^<]+)<\/guid>/);
    const d = new Date(pick(/<pubDate>([^<]+)<\/pubDate>/));
    eps.push({
      guid,
      title: pick(/<title>([\s\S]*?)<\/title>/),
      description: pick(/<description>([\s\S]*?)<\/description>/),
      pubDate: isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10),
      audioUrl,
      durationSecs: parseInt(pick(/<itunes:duration>(\d+)<\/itunes:duration>/) || "0", 10) || 0,
      caseSlug: EPISODE_CASE_SLUG[guid] ?? "",
    });
  }
  return eps;
}

export async function fetchPodcastEpisodes(): Promise<PodcastEpisode[]> {
  const eps = await cachedJson<PodcastEpisode[]>(
    "https://realufo.org/__podcast_episodes",
    async () => {
      const res = await fetch(PODCAST_FEED_URL, {
        headers: { "user-agent": "RealUFO-podcast-page/1.0" },
        redirect: "follow",
      });
      if (!res.ok) return null;
      return parsePodcastFeed(await res.text());
    },
    3600,
  );
  return eps ?? [];
}

// GET /api/podcast/episodes → published episodes, newest first.
export async function podcastEpisodes(req: Request, env: Env) {
  return json({ episodes: await fetchPodcastEpisodes() });
}
