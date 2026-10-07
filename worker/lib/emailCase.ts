// Weekly "case file" newsletter: one researched UFO case per week to email subscribers.
// Rotation is a D1 counter (email_case_idx) so every story gets its turn; the
// send is gated to Fridays (UTC) with an ISO-week watermark (email_case_week)
// so a missed Friday still goes out on the next tick instead of skipping.
import type { Env } from "../env";
import { sendEmail, shell, esc, emailOn } from "./email";
import { getState, setState } from "./push";
import { CASE_SLUGS } from "./caseStories";
import { CASE_STORY_TEXT } from "./caseStoryText";

const WEEK_WM = "email_case_week";
const IDX_KEY = "email_case_idx";

export function isoWeekKey(d: Date): string {
  // ISO-8601 week: Thursday decides the week-year.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - ((t.getUTCDay() + 6) % 7));
  const year = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function pickCaseSlug(idx: number): string {
  return CASE_SLUGS[((idx % CASE_SLUGS.length) + CASE_SLUGS.length) % CASE_SLUGS.length];
}

export function renderCaseNewsletter(slug: string, unsub: string): string {
  const story = CASE_STORY_TEXT[slug];
  if (!story) throw new Error(`no story for slug ${slug}`);
  const sec = story.sections[0];
  const hook = sec.paras.slice(0, 2).map((p) => `<p style="font-size:14px;line-height:1.6">${esc(p)}</p>`).join("");
  const quote = sec.quote
    ? `<blockquote style="border-left:3px solid #4df0a6;margin:16px 0;padding:4px 0 4px 12px;font-size:14px;font-style:italic;color:#e8ecf1">“${esc(sec.quote.text)}”<br><span style="font-size:12px;color:#6b7280;font-style:normal">— ${esc(sec.quote.who)}</span></blockquote>`
    : "";
  const tl = story.timeline.slice(0, 4).map((t) =>
    `<li style="margin:6px 0;font-size:13px"><span style="font-family:monospace;color:#4df0a6">${esc(t.date)}</span> <span style="color:#d7dce3">${esc(t.event)}</span></li>`).join("");
  const url = `https://realufo.org/case/${encodeURIComponent(slug)}`;
  const body = `
    <p style="font-size:12px;letter-spacing:1px;color:#4df0a6">🛸 THIS WEEK'S DECLASSIFIED CASE FILE</p>
    <h2 style="font-size:20px;color:#fff;margin:8px 0 4px">${esc(story.title)}</h2>
    <h3 style="font-size:14px;color:#9aa3ad;margin:0 0 8px">${esc(sec.heading)}</h3>
    ${hook}${quote}
    <h3 style="font-size:14px;color:#9aa3ad;margin:16px 0 4px">Key moments</h3>
    <ul style="padding-left:18px;margin:0">${tl}</ul>
    <p style="margin:18px 0"><a href="${url}" style="display:inline-block;background:#4df0a6;color:#07080c;padding:10px 22px;text-decoration:none;font-weight:bold;font-size:14px">READ THE FULL CASE FILE →</a></p>
    <p style="font-size:12px;color:#6b7280">Know someone who needs to see this? Forward it — they can <a href="https://realufo.org/notifications" style="color:#4df0a6">subscribe here</a>.</p>
    <p style="font-size:11px;color:#6b7280"><a href="${unsub}" style="color:#6b7280">unsubscribe</a> · <a href="https://realufo.org/shelf" style="color:#6b7280">reading shelf</a></p>`;
  return shell(`Case file: ${story.title}`, body);
}

export async function emailCaseOfWeek(env: Env, now: Date = new Date()): Promise<{ sent: boolean; slug?: string; n?: number }> {
  if (!emailOn(env)) return { sent: false };
  if (now.getUTCDay() !== 5) return { sent: false }; // Friday (UTC) only
  const week = isoWeekKey(now);
  if ((await getState(env, WEEK_WM)) === week) return { sent: false }; // already sent this week
  const idx = parseInt((await getState(env, IDX_KEY)) ?? "0", 10) || 0;
  const slug = pickCaseSlug(idx);
  const { results: subs } = await env.DB.prepare(
    "SELECT email, token FROM email_subscribers WHERE status='confirmed' LIMIT 100",
  ).all<{ email: string; token: string }>();
  await setState(env, WEEK_WM, week);
  await setState(env, IDX_KEY, String(idx + 1));
  if (!subs.length) return { sent: true, slug, n: 0 };
  const subject = `🛸 Case file: ${CASE_STORY_TEXT[slug].title}`;
  for (const s of subs) {
    const unsub = `https://realufo.org/api/email/unsubscribe?token=${s.token}`;
    await sendEmail(env, s.email, subject, renderCaseNewsletter(slug, unsub));
  }
  return { sent: true, slug, n: subs.length };
}
