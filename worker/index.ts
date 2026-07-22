import type { Env } from "./env";
import { on, dispatch } from "./router";
import { error } from "./lib/json";
import { health } from "./routes/health";
import { bootstrap } from "./routes/bootstrap";
import { feed } from "./routes/feed";
import { listRecords, getRecord } from "./routes/records";

on("GET", "/api/health", health);
on("GET", "/api/bootstrap", bootstrap);
on("GET", "/api/feed", feed);
on("GET", "/api/records", listRecords);
on("GET", "/api/records/:id", getRecord);

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      const res = await dispatch(req, env);
      return res ?? error(404, "not found");
    }
    return env.ASSETS.fetch(req); // SPA + assets; meta-injection added in Task 11
  },
} satisfies ExportedHandler<Env>;
