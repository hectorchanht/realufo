// Transient status line (rate-limit warnings, "Posted", sign-in
// confirmations, etc). Ported from realufo-handoff/RealUFO.dc.html lines
// 450-452 (`hasToast`/`{{ toast }}`); OverlayProvider.toast() sets the
// message and auto-clears it after 1900ms (prototype line 495).
export interface ToastProps {
  message: string | null;
}

// The role=status region stays mounted (empty between toasts) so screen
// readers announce each new message; only the pill comes and goes.
export function Toast({ message }: ToastProps) {
  return (
    <div role="status" data-toast className="fixed bottom-24 left-1/2 z-[95] w-max max-w-[calc(100vw-32px)] -translate-x-1/2 text-center">
      {message && (
        <div
          className="animate-[fadeup_.3s_ease] rounded-[11px] bg-ink px-4 py-3 font-mono text-xs font-semibold text-bg"
          style={{ boxShadow: "var(--shadow)" }}
        >
          ◉ {message}
        </div>
      )}
    </div>
  );
}

export default Toast;
