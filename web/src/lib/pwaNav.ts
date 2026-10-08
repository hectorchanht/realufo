// Navigation helpers for the installed PWA (standalone display mode).
//
// Root cause of the "PDF resets the app to the homepage" bug: on mobile the
// doc screen opened PDFs with window.open(url, "_blank"). In the installed
// PWA that hands the PDF to the system browser; Android then kills the
// backgrounded PWA and the back button cold-starts it at start_url ("/"),
// losing the record page entirely.
export { isStandalone } from "./install";
import { isStandalone } from "./install";

/**
 * Location indirection: jsdom's `window.location.assign` is non-configurable
 * so tests can't spy on it — they stub `pwaLocation.assign` instead.
 */
export const pwaLocation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};

/** Navigate the PWA window itself so the SPA back stack stays intact. */
export function navigateInPlace(url: string): void {
  pwaLocation.assign(url);
}

/**
 * Open a PDF URL. Installed PWA → navigate the app window itself (the
 * browser's PDF viewer renders there and the system back button returns to
 * the page); regular browser → new tab, unchanged behaviour.
 */
export function openPdf(url: string): void {
  if (isStandalone()) {
    navigateInPlace(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
