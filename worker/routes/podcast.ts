// "RealUFO Case Files" podcast — episode list parsed from the public RSS feed.
// The feed is the source of truth (podcast directories consume it); the parse
// is cached for an hour per colo so /podcast and /api/podcast/episodes stay cheap.
import { cachedJson } from "../lib/cache";
import { json, error } from "../lib/json";

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

async function fetchFeedEpisodes(): Promise<PodcastEpisode[]> {
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

// Episodes as served to the site: audio comes same-origin from R2
// (/api/podcast/audio/:slug) so playback never depends on a third-party
// signed-URL redirect chain. Episodes without a known case slug keep
// the feed's enclosure URL.
export async function fetchPodcastEpisodes(): Promise<PodcastEpisode[]> {
  const eps = await fetchFeedEpisodes();
  return eps.map((e) => ({
    ...e,
    audioUrl: e.caseSlug ? `/api/podcast/audio/${e.caseSlug}` : e.audioUrl,
  }));
}

// GET /api/podcast/episodes → published episodes, newest first.
export async function podcastEpisodes(req: Request, env: Env) {
  return json({ episodes: await fetchPodcastEpisodes() });
}

// Lazy mirror: first request for an episode's audio fetches the feed
// enclosure into R2 (podcast/<slug>.mp3); every request after that is
// served from R2 with byte-range support for mobile players.
async function mirrorEpisodeAudio(env: Env, slug: string): Promise<boolean> {
  try {
    const ep = (await fetchFeedEpisodes()).find((e) => e.caseSlug === slug);
    if (!ep) return false;
    const res = await fetch(ep.audioUrl, {
      headers: { "user-agent": "RealUFO-podcast-mirror/1.0" },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100_000) return false; // sanity: not an error page
    await env.MEDIA.put(`podcast/${slug}.mp3`, buf, {
      httpMetadata: { contentType: "audio/mpeg", cacheControl: "public, max-age=31536000, immutable" },
    });
    return true;
  } catch {
    return false;
  }
}

// GET /audio/podcast/:slug — episode audio, same-origin, with range support.
export async function podcastAudio(req: Request, env: Env, p: Record<string, string>) {
  const slug = p.slug ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) return error(404, "not found");
  const key = `podcast/${slug}.mp3`;
  const range = req.headers.get("range");

  const getObj = () =>
    range
      ? env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers })
      : env.MEDIA.get(key);

  let obj = await getObj();
  if (!obj || !("body" in obj)) {
    if (!(await mirrorEpisodeAudio(env, slug))) return error(404, "not found");
    obj = await getObj();
    if (!obj || !("body" in obj)) return error(404, "not found");
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("content-type", "audio/mpeg");
  headers.set("content-disposition", "inline");
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=31536000, immutable");

  const objAny = obj as R2ObjectBody & { range?: { offset?: number; length?: number } };
  if (range && objAny.range && "body" in obj) {
    const size = obj.size;
    const offset = objAny.range.offset ?? 0;
    const length = objAny.range.length ?? size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${size}`);
    headers.set("content-length", String(length));
    return new Response((obj as R2ObjectBody).body, { status: 206, headers });
  }
  return new Response((obj as R2ObjectBody).body, { headers });
}
