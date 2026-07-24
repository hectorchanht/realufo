// Transient status line (rate-limit warnings, "Posted", sign-in
// confirmations, etc). Ported from realufo-handoff/RealUFO.dc.html lines
// 450-452 (`hasToast`/`{{ toast }}`); OverlayProvider.toast() sets the
// message and auto-clears it after 1900ms (prototype line 495).
export interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return (
    <div
      role="status"
      data-toast
      className="fixed bottom-24 left-1/2 z-[95] -translate-x-1/2 animate-[fadeup_.3s_ease] whitespace-nowrap rounded-[11px] bg-ink px-[18px] py-[11px] font-mono text-xs font-semibold text-bg"
      style={{ boxShadow: "var(--shadow)" }}
    >
      ◉ {message}
    </div>
  );
}

export default Toast;
