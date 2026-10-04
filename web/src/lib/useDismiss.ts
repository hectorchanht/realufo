import { useEffect, type RefObject } from "react";

// Escape (focus back on the button) or a tap outside the button + panel closes.
export function useDismiss(open: boolean, close: () => void, btn: RefObject<HTMLElement | null>, panel: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      btn.current?.focus();
    };
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", down);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", down);
    };
  }, [open, close, btn, panel]);
}
