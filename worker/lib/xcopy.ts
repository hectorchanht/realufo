import type { Env } from "../env";
import { ASK_LLM_MODEL, answerText } from "./ask";
import { ARCHIVE_NAME, type Candidate } from "./xpick";

// Post text (Spec 4 §4.5). Voice: extremely online — one random meme format + reply
// hook per post. AI writes, code guarantees: no stray URLs (billing), facts anchored
// (place/year), ≤280 weighted chars, alien jokes only as jokes — never claims.

const TLD = "com|org|net|gov|mil|edu|io|co|us|uk|info|me|ai|app|dev|tv|ly|xyz";
const LINK_RE = new RegExp(String.raw`\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLD})\b(?:\/\S*)?`, "gi");
const BANNED = [
  /\bconfirmed alien/i, /\bproof\b/i, /\bproves?\b/i, /cover[- ]?up/i, /\bexposed\b/i, /\bnon-?human\b/i,
  // "not saying it's aliens but…" is the joke; "it's (definitely) aliens" is a claim
  /(?<!not saying )\bit(?:'|’)?s (?:definitely |literally |totally |100% |obviously )?aliens\b/i,
  /\b(?:definitely|literally|totally|100%|obviously) aliens\b/i,
  /\bf+u+c+k|\bsh[i1]t\b|\bmotherf/i, // PG-13 account
  /\b(?:baffl|stump|mystif)\w* (?:experts|scientists)|experts (?:are )?(?:baffled|stumped)/i, // invented hype
];

// One of each per post, chosen by code so posts vary and formats never stack.
export const FORMATS = [
  "POV: … (put the reader in the analyst's chair)",
  "nobody: / the Pentagon: … (two-line meme)",
  'the way the agency looked at this and gave its actual official verdict 💀',
  "me explaining to my mom that this is a real government file: …",
  "not saying it's aliens but… then the strangest real fact 👽 (obvious joke framing)",
  "the X-Files theme starts playing 🎶 then one real fact, one line",
  '"agency: their verdict" / "me: a reaction" two-line format',
  'rate the footage "x/10" and give a funny reason',
  "a deadpan one-liner that undersells it, then a reaction emoji",
  "a hot take that splits the replies into camps (drone / balloon / sensor glitch / 👽)",
];
const NSA = /not saying it'?s aliens/i; // the catchphrase: only when its own format is drawn
const ALIENS_FORMAT = FORMATS.find((f) => NSA.test(f))!;
// Template closers rotate so fallback posts don't all end the same way.
const CLOSERS = [
  "drop your theory 👇 #UAP", "drone, balloon, or 👽? #UAP", "wrong answers only 👇 #UAP",
  "explain this one 👀 #UAP", "enhance. ENHANCE. 🔍 #UAP", "not saying it's aliens but… 👽 #UAP",
];
const pickOne = <T>(xs: T[], rand: () => number) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];

export const HOOKS = [
  "drop your theory 👇", "drone, balloon, or 👽?", "explain this one 👇", "wrong answers only 👇",
  "what are we looking at", "thoughts? 👀", "enhance. ENHANCE.", "ratio this if it's a balloon",
];

export const isClean = (t: string) => !BANNED.some((re) => re.test(t));

export function weightedLength(text: string): number {
  let n = 0;
  const rest = text.replace(/https?:\/\/\S+/g, () => ((n += 23), ""));
  for (const ch of rest) {
    const c = ch.codePointAt(0)!;
    n += c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037) ? 1 : 2;
  }
  return n;
}

export const stripLinks = (t: string) => t.replace(LINK_RE, "").replace(/[ \t]{2,}/g, " ").replace(/ ([,.;:!?])/g, "$1").trim();

// pick: nothing — the appended /doc/<id> link carries the id
export const mustContain = (c: Candidate) =>
  c.stream === "pick" ? "" : c.stream === "release" ? c.label : "RealUFO";

const yearOf = (d: string | null) => /\b(?:19|20)\d{2}\b/.exec(d ?? "")?.[0] ?? null;

// Object counts ("two objects", "3 lights") must be counts the official summary uses.
// Durations don't count: "two minutes and 57 seconds" once became "two objects".
const NUM: Record<string, string> = { "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine" };
const COUNT = String.raw`\b(one|two|three|four|five|six|seven|eight|nine|[1-9])\b`;
const THINGS = /^[\s,]*(?:[\w“”"'-]+\s+){0,2}(objects?|uaps?|ufos?|craft|lights?|orbs?|things|targets|contacts|areas?|shapes?|dots?)\b/i;
const TIME = /^[\s,-]*(?:minutes?|seconds?|hours?|days?|years?|months?|weeks?)\b/i;
function counts(text: string, keep: (rest: string) => boolean) {
  const out = new Set<string>();
  for (const m of text.matchAll(new RegExp(COUNT, "gi")))
    if (keep(text.slice(m.index! + m[0].length))) out.add(NUM[m[1]] ?? m[1].toLowerCase());
  return out;
}
function countsOk(c: Candidate, t: string) {
  if (c.stream !== "pick") return true;
  const said = counts(t, (rest) => THINGS.test(rest));
  if (!said.size) return true;
  const official = counts(`${c.record.title ?? ""} ${c.record.summary ?? ""}`, (rest) => !TIME.test(rest));
  return [...said].every((n) => official.has(n));
}

// A pick post should name the record's place/year so the joke stays tied to the real
// file; when the AI skipped them (often its funniest lines), code adds a 📍 line.
const NA = /^(n\/?a|unknown|none|-)$/i;
function anchorLine(c: Candidate, t: string) {
  if (c.stream !== "pick") return "";
  const anchors = [c.record.location, yearOf(c.record.incident_date)].filter((a): a is string => !!a && !NA.test(a));
  return anchors.length && !anchors.some((a) => t.toLowerCase().includes(a.toLowerCase())) ? `📍 ${anchors.join(" · ")}` : "";
}

const fit = (s: string, max: number) => {
  if (weightedLength(s) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (weightedLength(out + ch) > max - 2) break; // "…" (U+2026) weighs 2 on X
    out += ch;
  }
  return out.trimEnd() + "…";
};

const kindsText = (k: Record<string, number>) =>
  Object.entries(k).map(([kind, n]) => `${n} ${kind === "pdf" ? "PDF" : kind}${n > 1 && kind !== "pdf" ? "s" : ""}`).join(", ");

export function template(c: Candidate, rand: () => number = Math.random): string {
  if (c.stream === "release") {
    const n = Object.values(c.kinds).reduce((a, b) => a + b, 0);
    return `🚨 ${c.label} just dropped: ${n} new file${n === 1 ? "" : "s"} (${kindsText(c.kinds)}). the government said "here you go" 🫠 dig in 👇 #UAP`;
  }
  if (c.stream === "pick") {
    const r = c.record;
    const meta = fit([...new Set([r.agency || ARCHIVE_NAME[r.archive] || r.archive, r.location, r.incident_date]
      .filter((v): v is string => !!v && !NA.test(v)))].join(" · "), 80);
    const foot = pickOne(CLOSERS, rand);
    const room = Math.min(120, 280 - weightedLength(`📼 \n📍 ${meta}\n${foot}\n${c.link}`)); // finalize appends the link
    const title = room > 10 ? fit(stripLinks(r.title ?? ""), room) : "";
    return `📼 ${title}\n📍 ${meta}\n${foot}`;
  }
  return `🔥 top thread on RealUFO this week (${c.thread.votes} votes): "${fit(stripLinks(c.thread.title), 160)}" thoughts? 👇 #UAP`;
}

// trusted = template built from official record metadata, so skip the banned-claims
// check (a real file title may contain words like "proof"). Never for user text.
export function finalize(c: Candidate, raw: string, trusted = false): string | null {
  let t = stripLinks(raw)
    .replace(/(^|\s)@\w+/g, "$1")
    .replace(/#(?!UAP\b)\w+/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
  if (!t || !t.includes(mustContain(c))) return null;
  // [..] / "with a joke" / "two-line format" = the model echoing its instructions
  if (!trusted && (!isClean(t) || /[[\]]|\bwith a joke\b|\btwo-line format\b|\breply hook\b/i.test(t) || !countsOk(c, t))) return null;
  const anchor = anchorLine(c, t);
  if (anchor) t += "\n" + anchor;
  if (c.stream !== "highlight") t += "\n" + c.link; // ours, after stripping any the AI wrote
  return weightedLength(t) <= 280 ? t : null;
}

const SYSTEM = (format: string, hook: string, must: string, recent: string[] = []) =>
  `You run the RealUFO account on X: the internet's archive of real declassified government UAP/UFO files and footage.
Voice: extremely online, chaotic-funny, meme-literate, slang ok, lowercase energy, playful but never mean. 1-3 emojis (👀🛸👽📼🫠💀🔥).
Use EXACTLY ONE format for this post: ${format}. Don't stack other meme formats.
End with this reply hook (or a close variant): "${hook}".
FACTS ARE SACRED: mention only facts in the data (agency, place, year, length, what the summary says the footage shows, the official verdict in your own words). Always mention the place or the year. Never invent who filmed it, how it moved, or any detail not in the summary.
Keep it PG-13 ("what the hell" ok, no f-bombs). Never claim experts or scientists are baffled.
Aliens: you may joke about them, but never state or imply it IS aliens, and never call anything proof or a cover-up.
Under 200 characters. Line breaks ok. No URLs, no website names, no @mentions, at most one hashtag: #UAP.${must ? ` It must include this exact text: "${must}".` : ""} Output only the post text.${recent.length ? `
Your last posts (don't reuse their openers, catchphrases or hooks):
${recent.map((t) => "- " + t.replace(/\s*https?:\/\/\S+/g, "").replace(/\s*\n\s*/g, " ")).join("\n")}` : ""}`;

function facts(c: Exclude<Candidate, { stream: "highlight" }>) {
  if (c.stream === "release") return { release: c.label, files: c.kinds, sample_titles: c.titles };
  const r = c.record;
  return { id: r.id, title: r.title, source: ARCHIVE_NAME[r.archive] ?? r.archive, agency: r.agency, kind: r.kind,
    incident_date: r.incident_date, location: r.location, duration_s: r.duration, summary: r.summary?.slice(0, 500) };
}

// 4-word phrases from recent posts: copy sharing one is a repeat ("the official verdict? unresolved.").
const grams = (t: string) => {
  const w = t.toLowerCase().replace(/https?:\/\/\S+/g, "").match(/[a-z0-9']+/g) ?? [];
  return new Set(w.slice(3).map((_, i) => w.slice(i, i + 4).join(" ")));
};
const repeats = (t: string, seen: Set<string>) => [...grams(t)].some((g) => seen.has(g));

// The bot's last posts, so the AI doesn't reuse openers/catchphrases. Best effort.
async function recentPosts(env: Env): Promise<string[]> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT text FROM x_posts WHERE status IN ('posted','pending','processing','draft') ORDER BY id DESC LIMIT 5"
    ).all<{ text: string }>();
    return results.map((r) => r.text);
  } catch {
    return [];
  }
}

export async function draft(env: Env, c: Candidate, rand: () => number = Math.random): Promise<{ text: string; ai: boolean }> {
  // Highlights: user-written text is a prompt-injection surface → fixed template,
  // banned-claims check applied (the caller has already rejected unclean titles).
  if (c.stream === "highlight") return { text: finalize(c, template(c)) ?? finalize(c, template(c), true)!, ai: false };
  const recent = await recentPosts(env);
  const seen = new Set(recent.flatMap((t) => [...grams(t)]));
  // up to 3 tries, each with a fresh format/hook; a repeat or a stray catchphrase burns one
  for (let attempt = 0; attempt < 3; attempt++) {
    const format = pickOne(FORMATS, rand);
    try {
      const out = await env.AI.run(ASK_LLM_MODEL as any, {
        messages: [
          { role: "system", content: SYSTEM(format, pickOne(HOOKS, rand), mustContain(c), recent) },
          { role: "user", content: JSON.stringify(facts(c)) },
        ],
        max_tokens: 200, temperature: 0.8, chat_template_kwargs: { enable_thinking: false },
      } as any);
      const t = finalize(c, answerText(out));
      if (t && (format === ALIENS_FORMAT || !NSA.test(t)) && !repeats(t, seen)) return { text: t, ai: true };
    } catch {
      break; // AI down → template; the bot never skips a slot because of AI
    }
  }
  // last resorts keep text non-null; an over-long one is rejected by X as a 4xx → failed row
  return { text: finalize(c, template(c, rand), true) ?? finalize(c, mustContain(c), true) ?? mustContain(c), ai: false };
}
