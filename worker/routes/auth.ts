import type { Env } from "../env";
import { json } from "../lib/json";

export async function login(req: Request, env: Env) {
  const b = await req.json<any>().catch(() => ({}));
  if (env.FEATURE_AUTH === "true") return json({ error: "not implemented" }, { status: 501 });
  const handle = (b.handle || "").trim() || (b.method === "google" ? "agent_scully" : "anon_signal");
  return json({ stub: true, me: { handle } });
}
