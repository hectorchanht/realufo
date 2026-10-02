type H = (req: Request, env: import("./env").Env, params: Record<string, string>) => Response | Promise<Response>;
interface Route { method: string; pattern: URLPattern; handler: H; }

const routes: Route[] = [];

export const on = (method: string, path: string, handler: H) =>
  routes.push({ method, pattern: new URLPattern({ pathname: path }), handler });

// URLPattern groups are still percent-encoded; ids like "…_of _Western…pdf"
// would otherwise 404. A malformed escape is kept verbatim.
export const decodeParams = (groups: Record<string, string | undefined>) =>
  Object.fromEntries(
    Object.entries(groups).map(([k, v]) => {
      try {
        return [k, decodeURIComponent(v ?? "")];
      } catch {
        return [k, v ?? ""];
      }
    })
  ) as Record<string, string>;

export async function dispatch(req: Request, env: import("./env").Env): Promise<Response | null> {
  const url = new URL(req.url);
  // HEAD = GET minus the body (link previewers / download managers probe with it).
  const head = req.method === "HEAD";
  for (const r of routes) {
    if (r.method !== (head ? "GET" : req.method)) continue;
    const m = r.pattern.exec({ pathname: url.pathname });
    if (!m) continue;
    const res = await r.handler(req, env, decodeParams(m.pathname.groups));
    if (head) await res.body?.cancel();
    return head ? new Response(null, res) : res;
  }
  return null;
}
