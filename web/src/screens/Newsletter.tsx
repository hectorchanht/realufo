// /newsletter — the weekly case-file archive. Past issues (newest first),
// each linking to its full case page, plus the email signup.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSetPageTitle } from "../lib/pageTitle";
import { api } from "../api/client";
import EmailAlerts from "../components/EmailAlerts";

interface Issue { week: string; slug: string; date: string }

export default function Newsletter() {
  useSetPageTitle("NEWSLETTER", "One declassified case file every Friday");
  const [issues, setIssues] = useState<Issue[] | null>(null);

  useEffect(() => {
    api.get<{ issues: Issue[] }>("/api/newsletter/issues")
      .then((r) => setIssues(r.issues))
      .catch(() => setIssues([]));
  }, []);

  return (
    <div data-screen="newsletter" className="mx-auto max-w-[720px]">
      <h1 className="font-mono text-[15px] font-bold text-ink">THE NEWSLETTER</h1>
      <p className="mb-4 mt-1 text-[13.5px] leading-[1.6] text-dim">
        One declassified UFO case file every Friday — researched from the primary documents,
        every claim cited. Free, no spam, unsubscribe anytime.
      </p>
      <EmailAlerts />
      <h2 className="mb-2 mt-6 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        PAST ISSUES
      </h2>
      {issues === null ? (
        <p className="text-[13px] text-dim">Loading…</p>
      ) : issues.length === 0 ? (
        <p className="text-[13px] text-dim">
          No issues sent yet — the first case file goes out this Friday.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.map((it) => (
            <li key={it.week} className="rounded-lg border border-line p-3">
              <Link to={`/case/${it.slug}`} className="text-[14px] font-bold text-signal hover:underline">
                Issue {it.week} — {it.slug.replace(/-/g, " ")}
              </Link>
              <div className="mt-0.5 font-mono text-[11px] text-faint">{it.date}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
