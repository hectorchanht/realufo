// Web Push on the client (spec Phase 2c). Permission is only ever requested from a tap.
import { api } from "../api/client";
import { isIos, isStandalone } from "./install";

export type EnableResult = "ok" | "denied" | "ios-install" | "unsupported";

// Toast copy for the non-ok results (short: toasts are one line).
export const ENABLE_MSG: Record<Exclude<EnableResult, "ok">, string> = {
  denied: "Notifications blocked in browser settings",
  "ios-install": "Add to Home Screen first (Share → Add)",
  unsupported: "Notifications not supported here",
};

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const keyBytes = (b64: string) =>
  Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const save = (sub: PushSubscription) => api.post("/api/push/subscribe", { subscription: sub.toJSON() });

export async function enablePush(): Promise<EnableResult> {
  if (isIos() && !isStandalone()) return "ios-install"; // iOS: push only inside the installed app
  if (!pushSupported()) return "unsupported";
  const existing = await currentSub();
  if (existing) {
    await save(existing); // server may have dropped it after failures
    return "ok";
  }
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const { publicKey } = await api.get<{ publicKey: string }>("/api/push/config");
  const reg = await navigator.serviceWorker.ready;
  await save(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  return "ok";
}

export async function disablePush() {
  const sub = await currentSub();
  if (!sub) return;
  await api.post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

// Once a day on app start: re-post the browser's subscription (it may have rotated,
// or the server dropped it). Stands in for pushsubscriptionchange, since the SW
// can't read the anon id from localStorage.
export async function resyncPush() {
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem("pushSync") === day) return;
    const sub = await currentSub();
    if (!sub) return;
    await save(sub);
    localStorage.setItem("pushSync", day);
  } catch {
    // offline / push off: try again next start
  }
}
