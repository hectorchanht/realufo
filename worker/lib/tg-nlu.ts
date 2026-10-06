// worker/lib/tg-nlu.ts — natural-language intent parsing for the Telegram admin portal.
// Hector replies in Cantonese/English mix, often very short ("好", "ok", "唔要").
// Classified via Workers AI; low confidence → ask, never guess wrong.

import type { Env } from "../env";
import { ASK_LLM_MODEL, answerText } from "./ask";
import type { Job } from "./jobs";

export type NluIntent =
  | { intent: "approve"; confidence: number }
  | { intent: "skip"; confidence: number }
  | { intent: "edit"; field: string; value: string; confidence: number }
  | { intent: "pause"; stream: string; confidence: number }
  | { intent: "resume"; stream: string; confidence: number }
  | { intent: "status"; confidence: number }
  | { intent: "help"; confidence: number }
  | { intent: "show"; confidence: number }
  | { intent: "unknown"; confidence: number };

// Streams the portal knows. "all" fans out to every stream.
export const PORTAL_STREAMS = ["record", "short", "article", "social", "poll"] as const;

// Below this, we ask for clarification instead of acting.
export const MIN_CONFIDENCE = 0.6;

const SYSTEM = `Parse the owner's Telegram reply about a content job. Output ONLY one JSON object, no other text.
Shape: {"intent":"<name>","confidence":0.0-1.0} plus fields below.

Intents:
- approve: {"intent":"approve","confidence":n}
- skip: {"intent":"skip","confidence":n}
- edit: {"intent":"edit","field":"<title|caption|text|description|image|pace>","value":"<new text or empty>","confidence":n}
- pause: {"intent":"pause","stream":"<record|short|article|social|poll|all>","confidence":n}
- resume: {"intent":"resume","stream":"<record|short|article|social|poll|all>","confidence":n}
- status: {"intent":"status","confidence":n}
- help: {"intent":"help","confidence":n}
- show: {"intent":"show","confidence":n} — re-send the job's media (video clip / images)
- unknown: {"intent":"unknown","confidence":n}

Few-shot (Cantonese + English, typos, informal):
"好" → {"intent":"approve","confidence":0.95}
"ok" → {"intent":"approve","confidence":0.95}
"得,出得" → {"intent":"approve","confidence":0.9}
"post it" → {"intent":"approve","confidence":0.9}
"唔要" → {"intent":"skip","confidence":0.95}
"skip" → {"intent":"skip","confidence":0.95}
"drop it" → {"intent":"skip","confidence":0.85}
"title 改做 外星人檔案解密" → {"intent":"edit","field":"title","value":"外星人檔案解密","confidence":0.95}
"轉title做 UFO真相" → {"intent":"edit","field":"title","value":"UFO真相","confidence":0.9}
"換張圖" → {"intent":"edit","field":"image","value":"","confidence":0.9}
"慢啲" → {"intent":"edit","field":"pace","value":"slower","confidence":0.8}
"快啲" → {"intent":"edit","field":"pace","value":"faster","confidence":0.8}
"停一停" → {"intent":"pause","stream":"all","confidence":0.7}
"pause shorts" → {"intent":"pause","stream":"short","confidence":0.95}
"shorts 停咗先" → {"intent":"pause","stream":"short","confidence":0.9}
"開返" → {"intent":"resume","stream":"all","confidence":0.7}
"resume all" → {"intent":"resume","stream":"all","confidence":0.95}
"有咩等緊" → {"intent":"status","confidence":0.9}
"status" → {"intent":"status","confidence":0.95}
"點用" → {"intent":"help","confidence":0.9}
"Show me video preview" → {"intent":"show","confidence":0.95}
"show me the clip" → {"intent":"show","confidence":0.95}
"俾條片我睇" → {"intent":"show","confidence":0.9}
"show images" → {"intent":"show","confidence":0.9}
"hello" → {"intent":"unknown","confidence":0.9}
"今日天氣點" → {"intent":"unknown","confidence":0.95}

Rules:
- Bare replacement text with no command words ("Check out this doc!") → unknown, confidence 0.8 (caller falls back to caption replace for post/showcase).
- Requests to SEE the media ("show me the video/clip/images", "俾條片我睇") → show, never edit: the owner wants to view, not to rewrite the caption.
- "shorts"/"short" → stream "short". No stream mentioned with pause/resume → "all".
- Ambiguous ("好似ok?", "唔知得唔得") → unknown, confidence ≤0.5.
- Never invent field/value. Keep value verbatim (Traditional Chinese as written).`;

export async function classifyIntent(env: Env, text: string, job: Job | null): Promise<NluIntent> {
  const fallback: NluIntent = { intent: "unknown", confidence: 0 };
  try {
    const ctx = job
      ? `Job #${job.id} kind=${job.kind} stream=${job.stream} ref=${job.ref} caption=${(job.caption ?? "").slice(0, 160)}`
      : "Job: none";
    const out = await env.AI.run(ASK_LLM_MODEL as any, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `${ctx}\nOwner: ${text.slice(0, 300)}` },
      ],
      max_tokens: 150, temperature: 0.1, chat_template_kwargs: { enable_thinking: false },
    } as any);
    const raw = answerText(out);
    const m = raw.match(/\{[\s\S]*?\}/);
    if (!m) return fallback;
    const p = JSON.parse(m[0]) as { intent?: string; field?: string; value?: string; stream?: string; confidence?: number };
    const c = typeof p.confidence === "number" ? Math.min(1, Math.max(0, p.confidence)) : 0.5;
    if (c < MIN_CONFIDENCE) return { intent: "unknown", confidence: c };
    switch (p.intent) {
      case "approve": return { intent: "approve", confidence: c };
      case "skip": return { intent: "skip", confidence: c };
      case "edit":
        if (p.field) return { intent: "edit", field: p.field.toLowerCase(), value: String(p.value ?? ""), confidence: c };
        return { ...fallback, confidence: c };
      case "pause": return { intent: "pause", stream: normStream(p.stream), confidence: c };
      case "resume": return { intent: "resume", stream: normStream(p.stream), confidence: c };
      case "status": return { intent: "status", confidence: c };
      case "help": return { intent: "help", confidence: c };
      case "show": return { intent: "show", confidence: c };
      default: return { intent: "unknown", confidence: c };
    }
  } catch {
    return fallback; // AI down → unknown; the caller asks for clarification, never silently drops
  }
}

function normStream(s: string | undefined): string {
  const v = (s ?? "").toLowerCase().replace(/s$/, ""); // "shorts" → "short"
  return (PORTAL_STREAMS as readonly string[]).includes(v) ? v : "all";
}

// Reply in Hector's language: CJK chars → Cantonese-flavoured Traditional Chinese, else English.
export const zh = (t: string) => /[\u4e00-\u9fff]/.test(t);
export const T = {
  approved: (id: number, cjk: boolean) => (cjk ? `✅ #${id} 批咗,出緊街` : `✅ #${id} approved, going out`),
  skipped: (id: number, cjk: boolean) => (cjk ? `❌ #${id} 掉咗` : `❌ #${id} skipped`),
  stale: (cjk: boolean) => (cjk ? "呢個 preview 過期喇,覆返最新嗰個" : "That preview is out of date — reply to the newest one"),
  multi: (cjk: boolean) => (cjk ? "有幾單等緊,覆返指定嗰個 preview" : "Several jobs are waiting — reply to a specific preview"),
  clarify: (cjk: boolean) =>
    cjk ? "唔明你講咩 😅 打 /help 睇指令, 或者試:「好」批 / 「唔要」skip / 「show video」重睇條片"
        : "Didn't catch that 😅 Type /help for commands, or try: \"ok\" to approve / \"skip\" / \"show video\" to re-watch",
  paused: (s: string, cjk: boolean) => (cjk ? `⏸️ ${s} 停咗,唔會再有新 job` : `⏸️ ${s} paused — no new jobs will queue`),
  resumed: (s: string, cjk: boolean) => (cjk ? `▶️ ${s} 開返` : `▶️ ${s} resumed`),
  edited: (id: number, cjk: boolean) => (cjk ? `✏️ #${id} 改好,睇下新 preview` : `✏️ #${id} updated — here's the new preview`),
  sendImage: (id: number, cjk: boolean) =>
    cjk ? `🖼️ #${id} 好,send 張新圖嚟 (reply 呢個訊息掟張相)`: `🖼️ #${id} — send the new image as a reply to this message`,
  paceNoted: (id: number, v: string, cjk: boolean) =>
    cjk ? `🎬 #${id} 收到「${v === "slower" ? "慢啲" : "快啲"}」,已記低,重做條片嗰陣會跟` : `🎬 #${id} pace "${v}" noted — the re-render will follow it`,
};
