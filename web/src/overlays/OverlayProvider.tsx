// Global overlay state: Composer (comment/reply/new-thread sheet), MediaViewer
// (doc/video/placeholder full-bleed viewer), LoginSheet (auth stub + theme
// switcher), and Toast (transient status line). NONE of these are routes —
// screens (Tasks 17-23) reach them via `useOverlay()`, and `<OverlayHost/>`
// renders whichever is active as a fixed-position layer above the whole app.
//
// Wiring: OverlayProvider wraps RouterProvider (App.tsx), but OverlayHost is
// mounted INSIDE the router tree (in AppShell), because the Composer calls
// useNavigate() and therefore needs a <Router> ancestor — hosting the overlays
// as a RouterProvider *sibling* crashed the app on composer open. The overlays
// are fixed-position, so being inside AppShell doesn't clip them.
//
// Ported from realufo-handoff/RealUFO.dc.html's single-component prototype:
// state fields `composer`/`viewer`/`login`/`toast`/`me` (lines 472-474), the
// open/close actions (lines 487-497), and the 1900ms toast auto-dismiss
// (line 495: `setTimeout(()=>this.setState({toast:null}),1900)`).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Composer } from "./Composer";
import { MediaViewer } from "./MediaViewer";
import { LoginSheet } from "./LoginSheet";
import { Toast } from "./Toast";

export type ComposerMode = "comment" | "reply" | "newThread";

export interface ComposerOpts {
  mode: ComposerMode;
  /** Comment target for mode==='comment' (POST /api/records/:id/comments). */
  recordId?: string;
  /** Reply target for mode==='reply' (POST /api/threads/:id/posts). */
  threadId?: string;
  /** "file a thread about this record" — echoed as source_record_id on submit. */
  sourceRecordId?: string;
  /** "REFERENCING FILE" chip label (prototype line 421's `composer.refLabel`). */
  refLabel?: string;
  /** Pre-fills the body textarea (the "promote a comment to its own thread" flow). */
  presetBody?: string;
  /** Pre-fills the thread-title input (mode==='newThread' only). */
  presetTitle?: string;
  /** Target board for mode==='newThread'; Composer falls back to 'uap' on submit. */
  boardId?: string;
}

export type ViewerKind = "doc" | "video" | "placeholder";

export interface ViewerOpts {
  kind: ViewerKind;
  url?: string;
  label?: string;
}

export interface OverlayMe {
  handle: string;
}

interface OverlayState {
  composer: ComposerOpts | null;
  viewer: ViewerOpts | null;
  login: boolean;
  toastMsg: string | null;
  me: OverlayMe | null;
}

export interface OverlayContextValue extends OverlayState {
  openComposer: (opts: ComposerOpts) => void;
  closeComposer: () => void;
  openViewer: (opts: ViewerOpts) => void;
  closeViewer: () => void;
  openLogin: () => void;
  closeLogin: () => void;
  toast: (message: string) => void;
  setMe: (me: OverlayMe | null) => void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

// prototype line 495: `setTimeout(()=>this.setState({toast:null}),1900)`.
const TOAST_MS = 1900;

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OverlayState>({
    composer: null,
    viewer: null,
    login: false,
    toastMsg: null,
    me: null,
  });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openComposer = useCallback((opts: ComposerOpts) => {
    setState((s) => ({ ...s, composer: opts }));
  }, []);
  const closeComposer = useCallback(() => setState((s) => ({ ...s, composer: null })), []);
  const openViewer = useCallback((opts: ViewerOpts) => setState((s) => ({ ...s, viewer: opts })), []);
  const closeViewer = useCallback(() => setState((s) => ({ ...s, viewer: null })), []);
  const openLogin = useCallback(() => setState((s) => ({ ...s, login: true })), []);
  const closeLogin = useCallback(() => setState((s) => ({ ...s, login: false })), []);
  const setMe = useCallback((me: OverlayMe | null) => setState((s) => ({ ...s, me })), []);
  const toast = useCallback((message: string) => {
    setState((s) => ({ ...s, toastMsg: message }));
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setState((s) => ({ ...s, toastMsg: null }));
    }, TOAST_MS);
  }, []);

  const value = useMemo<OverlayContextValue>(
    () => ({
      ...state,
      openComposer,
      closeComposer,
      openViewer,
      closeViewer,
      openLogin,
      closeLogin,
      toast,
      setMe,
    }),
    [state, openComposer, closeComposer, openViewer, closeViewer, openLogin, closeLogin, toast, setMe],
  );

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error("useOverlay must be used within an OverlayProvider");
  }
  return ctx;
}

/**
 * Renders whichever overlay is currently active (at most one of
 * Composer/MediaViewer/LoginSheet at a time — mirrors the prototype's
 * mutually-exclusive `sc-if`s) plus the Toast. Mount once, INSIDE the router
 * tree (AppShell) so the Composer's useNavigate() has a <Router> ancestor.
 */
export function OverlayHost() {
  const { composer, viewer, login, toastMsg, closeComposer, closeViewer, closeLogin } = useOverlay();

  // Esc closes the open overlay (composer > viewer > login, top-most first).
  useEffect(() => {
    if (!composer && !viewer && !login) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (composer) closeComposer();
      else if (viewer) closeViewer();
      else if (login) closeLogin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composer, viewer, login, closeComposer, closeViewer, closeLogin]);

  return (
    <>
      {composer && <Composer />}
      {viewer && <MediaViewer />}
      {login && <LoginSheet />}
      {toastMsg && <Toast message={toastMsg} />}
    </>
  );
}

export default OverlayProvider;
