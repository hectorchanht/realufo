// Auth-stub sheet + appearance switcher. Ported from
// realufo-handoff/RealUFO.dc.html lines 436-448 (Google / magic-link / "stay
// anonymous"). FEATURE_AUTH=false server-side, so POST /api/auth/login always
// returns the stub `{stub:true, me:{handle}}` (FRONTEND-CONTEXT.md) — real
// account behavior is out of scope, this just wires the stub + sets a client
// "me". There's no other settings surface yet, so the Task 16 brief has this
// sheet also host the theme/accent/scanlines switcher (useTheme, Task 12).
import { useState } from "react";
import { Saucer } from "../components/Saucer";
import { api, ApiError } from "../api/client";
import type { AuthStub } from "../api/types";
import { useOverlay } from "./OverlayProvider";
import { useTheme, type Accent } from "../theme/useTheme";

const ACCENTS: Accent[] = ["phosphor", "cyan", "amber", "violet"];

// Fixed swatch colors (dark-theme hex values from theme.css) — NOT the live
// `var(--signal)`/`var(--grn)` tokens, because those two get re-aliased to
// whichever accent is currently active (theme.css `[data-accent="..."]`
// blocks), so they can't represent "what would cyan/amber/violet look like"
// while a different accent is selected.
const ACCENT_SWATCH: Record<Accent, string> = {
  phosphor: "#4df0a6",
  cyan: "#46dfff",
  amber: "#ffb648",
  violet: "#b39bff",
};

export function LoginSheet() {
  const { login, closeLogin, toast, setMe } = useOverlay();
  const { theme, accent, scanlines, setTheme, setAccent, setScanlines } = useTheme();
  const [pending, setPending] = useState(false);

  if (!login) return null;

  async function doLogin(method: "google" | "magic") {
    if (pending) return;
    setPending(true);
    try {
      const data = await api.post<AuthStub>("/api/auth/login", { method });
      setMe(data.me);
      closeLogin();
      toast(method === "google" ? "Signed in via Google" : "Magic link sent — you are in");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast("slow down — too many posts");
      } else {
        toast("Could not sign in — try again");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] grid animate-[fadein_.2s_ease] place-items-center p-6"
      data-login-sheet
    >
      <div onClick={closeLogin} aria-hidden="true" className="absolute inset-0" style={{ background: "rgba(0,0,0,.7)" }} />
      <div className="relative w-full max-w-[340px] animate-[fadeup_.3s_ease] rounded-[20px] border border-line2 bg-bg2 p-6 text-center">
        <div className="mx-auto mb-[14px] w-fit">
          <Saucer />
        </div>
        <div className="font-pixel text-xs text-ink">
          JOIN THE <span className="text-signal">SIGNAL</span>
        </div>
        <p className="my-3 text-[13px] leading-[1.55] text-dim">
          You can post anonymously without any of this. An account just keeps your handle, saved files, and &quot;you
          were quoted&quot; pings.
        </p>

        <button
          type="button"
          onClick={() => void doLogin("google")}
          disabled={pending}
          className="mb-[10px] flex w-full items-center justify-center gap-[9px] rounded-xl bg-ink py-3 font-mono text-xs font-bold text-bg active:scale-[.98] disabled:opacity-60"
        >
          <span className="font-black">G</span>Continue with Google
        </button>
        <button
          type="button"
          onClick={() => void doLogin("magic")}
          disabled={pending}
          className="flex w-full items-center justify-center gap-[9px] rounded-xl border border-line2 py-3 font-mono text-xs font-semibold text-ink active:scale-[.98] disabled:opacity-60"
        >
          ✦ Email me a magic link
        </button>
        <button type="button" onClick={closeLogin} className="mt-4 font-mono text-[11px] text-faint">
          stay anonymous →
        </button>

        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-left" data-appearance-switcher>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[.5px] text-faint">THEME</span>
            <div className="flex gap-1.5">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  aria-pressed={theme === t}
                  className="rounded-md border px-2 py-1 font-mono text-[10px] capitalize"
                  style={{
                    borderColor: theme === t ? "var(--signal)" : "var(--line2)",
                    color: theme === t ? "var(--signal)" : "var(--dim)",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[.5px] text-faint">ACCENT</span>
            <div className="flex gap-1.5">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAccent(a)}
                  aria-pressed={accent === a}
                  aria-label={a}
                  className="h-5 w-5 rounded-full border-2"
                  style={{
                    borderColor: accent === a ? "var(--ink)" : "var(--line2)",
                    background: ACCENT_SWATCH[a],
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[.5px] text-faint">SCANLINES</span>
            <button
              type="button"
              onClick={() => setScanlines(!scanlines)}
              aria-pressed={scanlines}
              className="rounded-md border px-2 py-1 font-mono text-[10px]"
              style={{
                borderColor: scanlines ? "var(--signal)" : "var(--line2)",
                color: scanlines ? "var(--signal)" : "var(--dim)",
              }}
            >
              {scanlines ? "on" : "off"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginSheet;
