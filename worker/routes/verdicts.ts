import type { Env } from "../env";
import { json, error } from "../lib/json";
import { actorId } from "../lib/anon";
import { allowWrite } from "../lib/ratelimit";

// Spec 6 Part A: one verdict per visitor per file; posting the same verdict
// again clears it. The split is revealed only to visitors who voted.
export const VERDICTS = ["explained", "unexplained", "more_data"] as const;
export type Verdict = (typeof VERDICTS)[number];
type Tally = Record<Verdict, number>;
export type VerdictState = { mine: Verdict | null; total: number; tally?: Tally };

const isVerdict = (v: unknown): v is Verdict => typeof v === "string" && (VERDICTS as readonly string[]).includes(v);

async function tallyOf(env: Env, recordId: string): Promise<{ total: number; tally: Tally }> {
  const { results } = await env.DB.prepare(
    "SELECT verdict, count(*) n FROM record_verdicts WHERE record_id=? GROUP BY verdict"
  )
    .bind(recordId)
    .all<{ verdict: Verdict; n: number }>();
  const tally: Tally = { explained: 0, unexplained: 0, more_data: 0 };
  for (const r of results) tally[r.verdict] = r.n;
  return { total: tally.explained + tally.unexplained + tally.more_data, tally };
}

const mineOf = (env: Env, actor: string, recordId: string) =>
  env.DB.prepare("SELECT verdict FROM record_verdicts WHERE actor_id=? AND record_id=?")
    .bind(actor, recordId)
    .first<{ verdict: Verdict }>();

export async function verdictState(req: Request, env: Env, recordId: string): Promise<VerdictState> {
  const actor = await actorId(req, env.ANON_SALT);
  const [mine, t] = await Promise.all([actor === "anon:none" ? null : mineOf(env, actor, recordId), tallyOf(env, recordId)]);
  return mine ? { mine: mine.verdict, total: t.total, tally: t.tally } : { mine: null, total: t.total };
}

export async function castVerdict(req: Request, env: Env, p: Record<string, string>) {
  const b = await req.json<any>().catch(() => ({}));
  if (!isVerdict(b?.verdict)) return error(400, "bad verdict");
  const verdict = b.verdict;
  const actor = await actorId(req, env.ANON_SALT);
  if (actor === "anon:none") return error(400, "missing anon id");
  const rec = await env.DB.prepare("SELECT 1 FROM records WHERE id=? AND status='live'").bind(p.id).first();
  if (!rec) return error(404, "record not found");
  if (!(await allowWrite(env, req, "vote"))) return error(429, "slow down — too many votes");

  const cur = await mineOf(env, actor, p.id);
  const clearing = cur?.verdict === verdict;
  if (clearing) {
    await env.DB.prepare("DELETE FROM record_verdicts WHERE actor_id=? AND record_id=?").bind(actor, p.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO record_verdicts(actor_id,record_id,verdict) VALUES(?,?,?)
       ON CONFLICT(actor_id,record_id) DO UPDATE SET verdict=excluded.verdict, updated_at=datetime('now')`
    )
      .bind(actor, p.id, verdict)
      .run();
  }
  return json({ mine: clearing ? null : verdict, ...(await tallyOf(env, p.id)) });
}
