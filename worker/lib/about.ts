// /about text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/About.tsx).
// {{STATS}} is replaced by the page loader with live D1 counts.
export const ABOUT_HTML = `
<p>RealUFO is an independent, open-source archive of declassified UAP records. Every file is mirrored verbatim from official government sources — from the U.S. Department of War's PURSUE release tranches to holdings from NARA, NASA, the FBI, the CIA and others.</p>
<p>The archive is fully searchable and filterable: read the original PDFs in the built-in viewer, get an AI summary of any record, vote on the WTF-meter, discuss on the <a href="/boards">boards</a>, track new release tranches as they drop, and <a href="/ask">ask the archive</a> anything — answers are grounded in the records themselves.</p>
<h2>What this is not</h2>
<ul>
<li><b>Not a government website.</b> RealUFO is not operated by, affiliated with, endorsed by, or funded by any government.</li>
<li><b>Not an interpretation layer.</b> We don't label records "extraterrestrial", "explained" or "hoax" — the documents speak for themselves.</li>
<li><b>No account needed to browse.</b> Ever.</li>
</ul>
<h2>By the numbers</h2>
<p>{{STATS}}</p>
<h2>Open by design</h2>
<p>The full source — scrapers, API and this site — is on <a href="https://github.com/hectorchanht/realufo">GitHub</a>. There is a read-only <a href="/api/v1/openapi.json">public API</a> (docs at <a href="/developers">/developers</a>), <a href="/llms.txt">llms.txt</a> and <a href="/feed.xml">RSS</a> for the AI era, and embed badges for sharing records. U.S. federal records are public domain (17 U.S.C. § 105); everything else inherits its source jurisdiction's open licence.</p>
<h2>Get involved</h2>
<ul>
<li>Spot a bad mirror or a wrong summary? <a href="https://github.com/hectorchanht/realufo/issues">Open an issue</a>.</li>
<li>Want a file we don't have? <a href="https://docs.google.com/forms/d/e/1FAIpQLSesgIQPmSYoGsR4n2nkKMp18enYripao1yezoO62kHtKPIqJw/viewform" target="_blank" rel="noopener">Request it</a> — anonymous, no account.</li>
<li>New drops by email: <a href="/newsletter">newsletter</a> · listen: <a href="/podcast">podcast</a> · support the archive: <a href="https://ko-fi.com/realufo" target="_blank" rel="noopener">Ko-fi</a>.</li>
<li>Contact: <a href="mailto:hello@realufo.org">hello@realufo.org</a></li>
<li>The original static edition is preserved at <a href="https://release.realufo.org/">release.realufo.org</a>.</li>
</ul>
`;
