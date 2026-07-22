export const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });

export const error = (status: number, message: string) => json({ error: message }, { status });
