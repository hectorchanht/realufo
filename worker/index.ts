import type { Env } from "./env";
import { on, dispatch } from "./router";
import { error } from "./lib/json";
import { health } from "./routes/health";

on("GET", "/api/health", health);

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
