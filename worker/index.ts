import type { Env } from "./env";
import { on, dispatch } from "./router";
import { error } from "./lib/json";
import { health } from "./routes/health";
import { bootstrap } from "./routes/bootstrap";
import { feed } from "./routes/feed";
import { listRecords, getRecord } from "./routes/records";
import { listComments, addComment } from "./routes/comments";
import { boardThreads } from "./routes/boards";
import { getThread, createThread } from "./routes/threads";
import { createPost } from "./routes/posts";
import { toggleVote } from "./routes/votes";
import { getCase } from "./routes/cases";
import { login } from "./routes/auth";

on("GET", "/api/health", health);
on("GET", "/api/bootstrap", bootstrap);
on("GET", "/api/feed", feed);
on("GET", "/api/records", listRecords);
on("GET", "/api/records/:id", getRecord);
on("GET", "/api/records/:id/comments", listComments);
on("POST", "/api/records/:id/comments", addComment);
on("GET", "/api/boards/:id/threads", boardThreads);
on("GET", "/api/threads/:id", getThread);
on("POST", "/api/threads", createThread);
on("POST", "/api/threads/:id/posts", createPost);
on("POST", "/api/votes", toggleVote);
on("GET", "/api/cases/:slug", getCase);
on("POST", "/api/auth/login", login);

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
