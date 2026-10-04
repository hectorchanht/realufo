// Constant-time compare (hash both, then compare digests).
export async function sameSecret(a: string, b: string) {
  const h = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = [await h(a), await h(b)];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
