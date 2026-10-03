// "Install app" (spec Phase 1a). Chrome/Edge/Android fire beforeinstallprompt, which we
// keep and replay on tap; iOS Safari has no prompt, so the menu shows Add-to-Home-Screen steps.
import { useSyncExternalStore } from "react";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };
let deferred: InstallPromptEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // our menu item replaces Chrome's mini-infobar
  deferred = e as InstallPromptEvent;
  ping();
});
window.addEventListener("appinstalled", () => {
  deferred = null;
  ping();
});

export const isStandalone = () =>
  (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS reports itself as a Mac; touch points give it away.
export const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function installMode(): "prompt" | "ios" | null {
  if (isStandalone()) return null;
  if (deferred) return "prompt";
  return isIos() ? "ios" : null;
}

export async function promptInstall() {
  const d = deferred;
  deferred = null;
  ping();
  await d?.prompt();
}

export const useInstallMode = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    installMode,
  );
