import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";

// Spec 9 story polls: articles.poll = {q, opts}. Same rules as file verdicts: one vote per
// visitor per story, same opt again clears it, the split is shown only after you vote.
// Native social polls (poll_social, filled by lib/xpoll.ts) are public on their platform,
// so they're returned to everyone.
export type Poll = { q: string; opts: string[] };
export type PollSocial = { platform: "x" | "threads"; counts: number[]; total: number; closed: boolean };
export type PollState = { q: string; opts: string[]; mine: number | null; total: number; tally?: number[]; social: PollSocial[] };

// X's poll limits: 2-4 options, 25 chars each. Anything else in D1 = no poll (never a 500).
export function parsePoll(raw: string | null | undefined): Poll | null {
  let p: any;
  try {
    p = JSON.parse(raw ?? "");
  } catch {
    return null;
  }
  if (!p || typeof p.q !== "string" || !Array.isArray(p.opts)) return null;
  const q = p.q.trim();
  if (!q || q.length > 100 || p.opts.length < 2 || p.opts.length > 4) return null;
  if (!p.opts.every((o: unknown) => typeof o === "string")) return null;
  const opts = (p.opts as string[]).map((o) => o.trim());
  if (opts.some((o) => !o || o.length > 25) || new Set(opts).size !== opts.length) return null;
  return { q, opts };
}

const pollOf = async (env: Env, slug: string) =>
  parsePoll((await env.DB.prepare("SELECT poll FROM articles WHERE slug=?").bind(slug).first<{ poll: string | null }>())?.poll);

async function tallyOf(env: Env, slug: string, n: number) {
  const { results } = await env.DB.prepare("SELECT opt, count(*) c FROM poll_votes WHERE slug=? GROUP BY opt")
    .bind(slug).all<{ opt: number; c: number }>();
  const tally = Array<number>(n).fill(0);
  for (const r of results) if (r.opt < n) tally[r.opt] = r.c;
  return { tally, total: tally.reduce((a, b) => a + b, 0) };
}

async function socialOf(env: Env, slug: string): Promise<PollSocial[]> {
  const { results } = await env.DB.prepare(
    "SELECT platform, counts, total, status FROM poll_social WHERE slug=? AND counts IS NOT NULL ORDER BY platform DESC"
  ).bind(slug).all<{ platform: "x" | "threads"; counts: string; total: number; status: string }>();
  return results.map((r) => ({ platform: r.platform, counts: JSON.parse(r.counts), total: r.total ?? 0, closed: r.status === "closed" }));
}

const mineOf = async (env: Env, actor: string, slug: string) =>
  actor === "anon:none"
    ? null
    : ((await env.DB.prepare("SELECT opt FROM poll_votes WHERE actor_id=? AND slug=?").bind(actor, slug).first<{ opt: number }>())?.opt ?? null);

// reveal: the tally goes to voters, and to anyone who just acted (a clear included)
async function stateOf(env: Env, slug: string, poll: Poll, mine: number | null, reveal = mine !== null): Promise<PollState> {
  const [{ tally, total }, social] = await Promise.all([tallyOf(env, slug, poll.opts.length), socialOf(env, slug)]);
  return { ...poll, mine, total, ...(reveal ? { tally } : {}), social };
}

export async function getPoll(req: Request, env: Env, p: Record<string, string>) {
  const poll = await pollOf(env, p.slug);
  if (!poll) return error(404, "no poll");
  return json(await stateOf(env, p.slug, poll, await mineOf(env, await actorId(req, env.ANON_SALT), p.slug)));
}

export async function castPoll(req: Request, env: Env, p: Record<string, string>) {
  const b = await req.json<any>().catch(() => ({}));
  const poll = await pollOf(env, p.slug);
  if (!poll) return error(404, "no poll");
  const opt = b?.opt;
  if (!Number.isInteger(opt) || opt < 0 || opt >= poll.opts.length) return error(400, "bad option");
  const actor = await actorId(req, env.ANON_SALT);
  if (actor === "anon:none") return error(400, "missing anon id");
  if (!(await allowWrite(env, req, "vote"))) return error(429, "slow down — too many votes");

  const clearing = (await mineOf(env, actor, p.slug)) === opt;
  if (clearing) {
    await env.DB.prepare("DELETE FROM poll_votes WHERE actor_id=? AND slug=?").bind(actor, p.slug).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO poll_votes(actor_id,slug,opt) VALUES(?,?,?)
       ON CONFLICT(actor_id,slug) DO UPDATE SET opt=excluded.opt, updated_at=datetime('now')`
    ).bind(actor, p.slug, opt).run();
  }
  return json(await stateOf(env, p.slug, poll, clearing ? null : opt, true));
}
