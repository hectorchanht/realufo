// AI discussion starter: one sharp, document-specific question per quiet record.
// Generated once via Workers AI (same model + response parsing as /api/ask) and
// cached in D1. No new migration: reuses the existing ask_cache table under a
// `starter:` key prefix. The ask route's 7-day cleanup also refreshes stale
// starters — they regenerate on the next view, so this self-heals.
import { ASK_LLM_MODEL, answerText } from "../lib/ask";
import { error, json } from "../lib/json";
import { allowWrite } from "../lib/ratelimit";
import type { Env } from "../env";

const CACHE_PREFIX = "starter:";
const MAX_LEN = 300;

const cacheKey = (id: string, lang: string) => `${CACHE_PREFIX}${id}:${lang === "zh-Hant" ? "zh" : "en"}`;

function buildPrompt(title: string, agency: string | null, date: string | null, summary: string, lang: string): string {
  const meta = [agency, date].filter(Boolean).join(" · ");
  const language = lang === "zh-Hant" ? "Traditional Chinese (zh-Hant)" : "English";
  return (
    `You write discussion prompts for readers of a declassified U.S. government UAP document archive.\n` +
    `Document: "${title}"${meta ? ` (${meta})` : ""}\n` +
    `AI summary of its contents: "${summary}"\n\n` +
    `Write ONE sharp, specific discussion question about this document's content — something that invites a reader ` +
    `to share their interpretation or argue a point. It must be a genuine question, not a restatement of the summary, ` +
    `and not a trivia question with a single factual answer. Under 40 words. End with a question mark. ` +
    `Write it in ${language}.\n` +
    `Output only the question, no preamble, no quotation marks.`
  );
}

// A starter must read as a real question. Anything else → null (the card
// simply doesn't render) rather than shipping model slop to the page.
function cleanQuestion(raw: string): string | null {
  const q = raw
    .trim()
    .replace(/^(["'“‘「『]|&quot;)+/, "")
    .replace(/(["'”’」』]|&quot;)+$/, "")
    .trim();
  if (!q || q.length > MAX_LEN) return null;
  if (!/[?？]\s*$/.test(q)) return null;
  return q;
}

export const recordStarter = async (req: Request, env: Env, p: Record<string, string>) => {
  const url = new URL(req.url);
  const lang = url.searchParams.get("lang") === "zh-Hant" ? "zh-Hant" : "en";
  const id = p.id;

  // Cache-first: at most one generation per record+lang ever (until the ask
  // route's 7-day cleanup refreshes it), so scraping every record id is the
  // worst case an abuser can force — bounded by the record count.
  const key = cacheKey(id, lang);
  const hit = await env.DB.prepare("SELECT answer FROM ask_cache WHERE key=?")
    .bind(key)
    .first<{ answer: string }>();
  if (hit) {
    try {
      const parsed = JSON.parse(hit.answer) as { question?: string | null };
      return json({ question: parsed.question ?? null, cached: true });
    } catch {
      // Corrupt row: fall through and regenerate.
    }
  }
  if (!(await allowWrite(env, req, "starter"))) return error(429, "slow down — too many requests");

  const row = await env.DB.prepare(
    `SELECT r.title, r.agency, r.incident_date, t.ai_summary
     FROM records r LEFT JOIN record_text t ON t.record_id = r.id WHERE r.id = ?`,
  )
    .bind(id)
    .first<{ title: string; agency: string | null; incident_date: string | null; ai_summary: string | null }>();
  if (!row) return error(404, "not found");
  if (!row.ai_summary) return json({ question: null });

  let question: string | null = null;
  try {
    const out = await env.AI.run(ASK_LLM_MODEL as any, {
      messages: [{ role: "user", content: buildPrompt(row.title, row.agency, row.incident_date, row.ai_summary, lang) }],
      max_tokens: 150,
      temperature: 0.7,
      chat_template_kwargs: { enable_thinking: false },
    } as any);
    question = cleanQuestion(answerText(out));
  } catch (e) {
    console.error("starter generation failed", e);
  }
  // Cache even nulls: a record with no generatable question shouldn't burn an
  // LLM call on every view.
  await env.DB.prepare("INSERT OR REPLACE INTO ask_cache(key, answer) VALUES(?,?)")
    .bind(key, JSON.stringify({ question }))
    .run();
  return json({ question, cached: false });
};
