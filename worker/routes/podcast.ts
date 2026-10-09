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

// Self-hosted podcast RSS for directories (YouTube, Apple, Spotify).
// GET /podcast/feed.xml — the muse.ai feed can't carry an owner email, which
// YouTube's ingestion requires ("Missing owner email for RSS feed"), so this
// feed is generated here with a proper itunes:owner tag. Episode data comes
// from the muse.ai feed (source of truth); enclosures are same-origin
// R2-backed audio (/api/podcast/audio/:slug) so directories never depend on
// a third-party host. Add one AUDIO_BYTES line per episode when publishing.
const FEED_OWNER_EMAIL = "realufo.org@gmail.com";
const AUDIO_BYTES: Record<string, number> = {
  roswell: 2521957,
};

const escXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function podcastFeedXml(): Promise<Response> {
  const eps = await fetchPodcastEpisodes();
  const items = eps
    .map((e) => {
      const audio = e.caseSlug
        ? `https://realufo.org/api/podcast/audio/${e.caseSlug}`
        : e.audioUrl;
      const len = e.caseSlug ? AUDIO_BYTES[e.caseSlug] : 0;
      const link = e.caseSlug
        ? `https://realufo.org/case/${e.caseSlug}`
        : "https://realufo.org/podcast";
      // e.pubDate is YYYY-MM-DD (feed parse); time of day unknown → noon UTC.
      const pubDate = e.pubDate
        ? new Date(e.pubDate + "T12:00:00Z").toUTCString()
        : new Date().toUTCString();
      return `    <item>
      <title>${escXml(e.title)}</title>
      <link>${link}</link>
      <description><![CDATA[${e.description}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">${escXml(e.guid || audio)}</guid>
      <enclosure url="${escXml(audio)}"${len ? ` length="${len}"` : ""} type="audio/mpeg"/>
      <itunes:duration>${e.durationSecs || 0}</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>RealUFO Case Files</title>
    <link>https://realufo.org/podcast</link>
    <language>en</language>
    <description>One declassified UFO case file every week, in audio. The same case as the Friday email — listen or read, your pick.</description>
    <atom:link href="https://realufo.org/podcast/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>RealUFO</itunes:author>
    <itunes:owner>
      <itunes:name>RealUFO</itunes:name>
      <itunes:email>${FEED_OWNER_EMAIL}</itunes:email>
    </itunes:owner>
    <itunes:image href="https://realufo.org/podcast-cover.webp"/>
    <itunes:category text="Science"/>
    <itunes:explicit>no</itunes:explicit>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
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
