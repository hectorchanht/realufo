type H = (req: Request, env: import("./env").Env, params: Record<string, string>) => Response | Promise<Response>;
interface Route { method: string; pattern: URLPattern; handler: H; }

const routes: Route[] = [];

export const on = (method: string, path: string, handler: H) =>
  routes.push({ method, pattern: new URLPattern({ pathname: path }), handler });

export async function dispatch(req: Request, env: import("./env").Env): Promise<Response | null> {
  const url = new URL(req.url);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec({ pathname: url.pathname });
    if (m) return r.handler(req, env, m.pathname.groups as Record<string, string>);
  }
  return null;
}
