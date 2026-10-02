import type { Env } from "../env";
import { ASK_LLM_MODEL, answerText } from "./ask";
import { ARCHIVE_NAME, type Candidate } from "./xpick";

// Post text (Spec 4 §4.5). AI writes, code guarantees: no stray URLs (billing),
// required id present, ≤280 weighted chars, no "proof of aliens" claims.

const TLD = "com|org|net|gov|mil|edu|io|co|us|uk|info|me|ai|app|dev|tv|ly|xyz";
const LINK_RE = new RegExp(String.raw`\bhttps?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLD})\b(?:\/\S*)?`, "gi");
const BANNED = [/\bconfirmed alien/i, /\bproof\b/i, /\bproves?\b/i, /cover[- ]?up/i, /\bexposed\b/i, /\bshocking\b/i, /\bnon-?human\b/i];

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

export const mustContain = (c: Candidate) =>
  c.stream === "pick" ? c.record.id : c.stream === "release" ? c.label : "RealUFO";

const fit = (s: string, max: number) => {
  if (weightedLength(s) <= max) return s;
  let out = "";
  for (const ch of s) {
    if (weightedLength(out + ch) > max - 1) break;
    out += ch;
  }
  return out.trimEnd() + "…";
};

const kindsText = (k: Record<string, number>) =>
  Object.entries(k).map(([kind, n]) => `${n} ${kind === "pdf" ? "PDF" : kind}${n > 1 && kind !== "pdf" ? "s" : ""}`).join(", ");

export function template(c: Candidate): string {
  if (c.stream === "release") {
    const n = Object.values(c.kinds).reduce((a, b) => a + b, 0);
    return `NEW: ${c.label}. ${n} file${n === 1 ? "" : "s"} (${kindsText(c.kinds)}), mirrored and searchable. #UAP`;
  }
  if (c.stream === "pick") {
    const r = c.record;
    const meta = [ARCHIVE_NAME[r.archive] ?? r.archive, r.agency, r.location, r.incident_date].filter(Boolean).join(" · ");
    return `${r.id}: ${fit(stripLinks(r.title ?? ""), 120)}\n${fit(meta, 80)}\nFull file on RealUFO: ${r.id} #UAP`;
  }
  return `Top thread on RealUFO this week (${c.thread.votes} votes): ${fit(stripLinks(c.thread.title), 160)} #UAP`;
}

// trusted = template text (metadata verbatim), so skip the banned-claims check:
// a real file title may contain words like "proof".
export function finalize(c: Candidate, raw: string, trusted = false): string | null {
  let t = stripLinks(raw)
    .replace(/(^|\s)@\w+/g, "$1")
    .replace(/#(?!UAP\b)\w+/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();
  if (!t || !t.includes(mustContain(c))) return null;
  if (!trusted && BANNED.some((re) => re.test(t))) return null;
  if (c.stream === "release") t += "\n" + c.link;
  return weightedLength(t) <= 280 ? t : null;
}

const SYSTEM = (must: string) =>
  `You write posts for the RealUFO X account, a public archive of declassified government UAP/UFO files. ` +
  `Write ONE post under 220 characters. Say what the file is, where and when, in plain neutral language. ` +
  `Never claim it proves anything, never speculate about aliens. No URLs, no website names, no @mentions, ` +
  `at most one hashtag: #UAP. It must include this exact text: "${must}". Output only the post text.`;

function facts(c: Candidate) {
  if (c.stream === "release") return { release: c.label, files: c.kinds, sample_titles: c.titles };
  if (c.stream === "pick") {
    const r = c.record;
    return { id: r.id, title: r.title, source: ARCHIVE_NAME[r.archive] ?? r.archive, agency: r.agency, kind: r.kind,
      incident_date: r.incident_date, location: r.location, duration_s: r.duration, summary: r.summary?.slice(0, 500) };
  }
  return { community_thread_title: c.thread.title, thread_excerpt: c.thread.body, votes: c.thread.votes, site: "RealUFO" };
}

export async function draft(env: Env, c: Candidate): Promise<{ text: string; ai: boolean }> {
  try {
    const out = await env.AI.run(ASK_LLM_MODEL as any, {
      messages: [{ role: "system", content: SYSTEM(mustContain(c)) }, { role: "user", content: JSON.stringify(facts(c)) }],
      max_tokens: 200, temperature: 0.7, chat_template_kwargs: { enable_thinking: false },
    } as any);
    const t = finalize(c, answerText(out));
    if (t) return { text: t, ai: true };
  } catch {
    // AI down → template; the bot never skips a slot because of AI
  }
  return { text: finalize(c, template(c), true)!, ai: false };
}
