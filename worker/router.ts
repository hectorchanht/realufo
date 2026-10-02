type H = (req: Request, env: import("./env").Env, params: Record<string, string>) => Response | Promise<Response>;
interface Route { method: string; pattern: URLPattern; handler: H; }

const routes: Route[] = [];

export const on = (method: string, path: string, handler: H) =>
  routes.push({ method, pattern: new URLPattern({ pathname: path }), handler });

// URLPattern groups stay percent-encoded ("of%20_Western"); ids are stored decoded.
// Malformed escapes → null, so the caller treats the path as no match (404, not 500).
export function decodedGroups(m: URLPatternResult): Record<string, string> | null {
  try {
    return Object.fromEntries(Object.entries(m.pathname.groups).map(([k, v]) => [k, decodeURIComponent(v ?? "")]));
  } catch {
    return null;
  }
}

export async function dispatch(req: Request, env: import("./env").Env): Promise<Response | null> {
  const url = new URL(req.url);
  // HEAD = GET minus the body (link previewers / download managers probe with it).
  const head = req.method === "HEAD";
  for (const r of routes) {
    if (r.method !== (head ? "GET" : req.method)) continue;
    const m = r.pattern.exec({ pathname: url.pathname });
    const params = m && decodedGroups(m);
    if (!params) continue;
    const res = await r.handler(req, env, params);
    if (head) await res.body?.cancel();
    return head ? new Response(null, res) : res;
  }
  return null;
}
