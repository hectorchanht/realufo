// Email alert signup (double opt-in via Resend).
import { Bell } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client";

export default function EmailAlerts() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    try {
      const r = await api.post<{ ok: boolean; sent: boolean; already?: boolean }>("/api/email/subscribe", { email: email.trim() });
      if (r.already) {
        setMsg("This email is already subscribed.");
      } else if (r.sent) {
        setMsg("Check your inbox — click the confirm link to start getting alerts.");
      } else {
        setMsg("Saved, but the confirm email failed to send. Try again later.");
      }
      setState("sent");
    } catch {
      setState("error");
      setMsg("Could not subscribe — check the email and try again.");
    }
  }

  return (
    <section aria-labelledby="email-alerts" className="mb-6">
      <h2 id="email-alerts" className="mb-1 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        EMAIL ALERTS
      </h2>
      <p className="mb-2 text-[13px] text-dim">One declassified case file every week, plus an alert when new files land. No spam, unsubscribe anytime.</p>
      {state === "sent" ? (
        <p className="rounded-lg border border-line p-3 text-[13px] text-ink">{msg}</p>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email for alerts"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-[14px] text-ink placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="flex flex-none items-center gap-[7px] rounded-lg bg-signal px-4 py-2 font-mono text-[13px] font-bold text-black disabled:opacity-50"
          >
            <Bell size={14} strokeWidth={2.25} aria-hidden="true" />
            {state === "sending" ? "…" : "ALERT ME"}
          </button>
        </form>
      )}
      {state === "error" && <p className="mt-1 text-[12px] text-red-400">{msg}</p>}
    </section>
  );
}
