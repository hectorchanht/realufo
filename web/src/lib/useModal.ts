import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,video[controls],[tabindex]:not([tabindex="-1"])';

/** Modal focus contract while `open`: focus moves in (a `[data-autofocus]`
 *  element — the container itself may carry it — else the first focusable,
 *  else the container), Tab / Shift+Tab wrap inside, everything outside the container
 *  is inert (live regions excepted, so toasts still announce), and on close
 *  focus returns to whatever had it before. */
export function useModal(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const prev = document.activeElement as HTMLElement | null;
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];

    // inert every sibling along the path to <body> (the Shorts player's approach)
    const inerted: Element[] = [];
    for (let n: Element = el; n.parentElement && n !== document.body; n = n.parentElement) {
      for (const s of n.parentElement.children) {
        if (s === n || s.hasAttribute("inert") || s.matches("script,[aria-live],[role=status]")) continue;
        s.setAttribute("inert", "");
        inerted.push(s);
      }
    }

    if (!el.contains(document.activeElement)) {
      const first = el.matches("[data-autofocus]") ? el : (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0]);
      if (first) first.focus();
      else {
        if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
        el.focus();
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = items();
      if (!all.length) return e.preventDefault();
      const first = all[0];
      const last = all[all.length - 1];
      const at = document.activeElement;
      if (e.shiftKey ? at === first || at === el : at === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      inerted.forEach((s) => s.removeAttribute("inert"));
      if (prev?.isConnected) prev.focus();
    };
  }, [ref, open]);
}
