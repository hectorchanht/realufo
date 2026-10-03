// Sharing a link (Spec 8 §3.3): the phone's share sheet when there is one,
// else the clipboard. iOS rejects navigator.share with NotAllowedError when the
// tap gesture was spent on an await before it — fall back to copying then.
export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export const absUrl = (url: string) => new URL(url, location.origin).href;

export async function shareLink(title: string, url: string): Promise<ShareResult> {
  const abs = absUrl(url);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url: abs });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(abs);
    return "copied";
  } catch {
    return "failed";
  }
}

export const xIntent = (title: string, url: string) =>
  `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(absUrl(url))}`;

// "/ask/123-slug" param → 123. Same rule as worker/lib/ask.ts askIdOf.
export const askIdOf = (param: string) => Number(/^(\d+)(?:-|$)/.exec(param)?.[1]) || null;
