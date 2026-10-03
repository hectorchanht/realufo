// /privacy text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/Privacy.tsx).
export const PRIVACY_UPDATED = "2026-10-02";

export const PRIVACY_HTML = `
<p>RealUFO is an independent archive of declassified, public-domain UAP records. There are no accounts, no ads and no tracking or analytics scripts.</p>
<h2>What we store</h2>
<ul>
<li><b>Anonymous browser id.</b> Your browser makes a random id and keeps it in local storage. We store only a salted hash of it, to attribute votes and posts and to apply rate limits.</li>
<li><b>IP address.</b> Used only for rate limiting and stored as a salted hash, never in plain form.</li>
<li><b>What you post.</b> Comments, threads, votes, verdicts and uploaded images are public. Uploads pass through Cloudflare's CSAM scanning.</li>
<li><b>Ask questions.</b> Questions you ask are logged with the hashed browser id so we can improve answers. They are shown publicly only if you choose to share them.</li>
<li><b>Preferences.</b> Theme and similar settings stay in your browser's local storage.</li>
</ul>
<h2>Who processes it</h2>
<p>The site runs on Cloudflare (hosting, database, file storage and the AI models behind Ask), which handles requests under its own privacy policy. We do not sell or share your data. Our social accounts (X, Bluesky and others) only post archive content, never visitor data.</p>
<h2>Your choices</h2>
<p>Clearing your browser's site data resets your anonymous id. To have something you posted removed, email <a href="mailto:hello@realufo.org">hello@realufo.org</a> with a link to it.</p>
<p>Last updated ${PRIVACY_UPDATED}.</p>
`;
