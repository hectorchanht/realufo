// /contact text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/Contact.tsx).
// Social URLs are the SOCIAL_PROFILES canonicals (worker/lib/profiles.ts).
export const CONTACT_HTML = `
<p>The fastest way to reach the people behind RealUFO:</p>
<h2>Email</h2>
<ul>
<li><b>General, press and research:</b> <a href="mailto:hello@realufo.org">hello@realufo.org</a></li>
</ul>
<h2>Report a problem</h2>
<ul>
<li>Bad mirror, wrong summary, broken page: <a href="https://github.com/hectorchanht/realufo/issues">open a GitHub issue</a> — it's public, so others can see it's being handled.</li>
</ul>
<h2>Request a file</h2>
<p>Looking for a record we don't have yet? <a href="https://docs.google.com/forms/d/e/1FAIpQLSesgIQPmSYoGsR4n2nkKMp18enYripao1yezoO62kHtKPIqJw/viewform" target="_blank" rel="noopener">Request it here</a> — anonymous, no account needed.</p>
<h2>Follow the archive</h2>
<ul>
<li><a href="https://x.com/realufo_org" target="_blank" rel="noopener">X</a> · <a href="https://bsky.app/profile/realufo.bsky.social" target="_blank" rel="noopener">Bluesky</a> · <a href="https://www.facebook.com/realufo.org/" target="_blank" rel="noopener">Facebook</a> · <a href="https://www.instagram.com/realufo_org/" target="_blank" rel="noopener">Instagram</a> · <a href="https://www.threads.com/@realufo_org" target="_blank" rel="noopener">Threads</a> · <a href="https://www.youtube.com/@realufo_org" target="_blank" rel="noopener">YouTube</a></li>
<li><a href="/newsletter">Newsletter</a> · <a href="/podcast">podcast</a> · <a href="/feed.xml">RSS</a></li>
</ul>
`;
