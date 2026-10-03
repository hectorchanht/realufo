// /privacy text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/Privacy.tsx).
export const PRIVACY_UPDATED = "2026-10-03";

export const PRIVACY_HTML = `
<p>RealUFO is an independent archive of declassified, public-domain UAP records. There are no accounts, no ads and no tracking across sites. To count visits we use <b>Cloudflare Web Analytics</b>, which sets no cookies, stores nothing in your browser and does not fingerprint you; it reports only aggregate page views, referrers and page speed.</p>
<h2>What we store</h2>
<ul>
<li><b>Anonymous browser id.</b> Your browser makes a random id and keeps it in local storage. We store only a salted hash of it, to attribute votes and posts and to apply rate limits.</li>
<li><b>IP address.</b> Used only for rate limiting and stored as a salted hash, never in plain form.</li>
<li><b>What you post.</b> Comments, threads, votes, verdicts and uploaded images are public. Uploads pass through Cloudflare's CSAM scanning.</li>
<li><b>Ask questions.</b> Questions you ask are logged with the hashed browser id so we can improve answers. They are shown publicly only if you choose to share them.</li>
<li><b>Preferences.</b> Theme and similar settings stay in your browser's local storage.</li>
</ul>
<h2>Who processes it</h2>
<p>The site runs on Cloudflare (hosting, database, file storage, visit counts and the AI models behind Ask), which handles requests under its own privacy policy. We do not sell or share your data. Our social accounts (X, Bluesky and others) only post archive content, never visitor data.</p>
<h2>Google, YouTube and social accounts</h2>
<p>RealUFO posts archive content (clips, images and short summaries of public records) to its own accounts on X, Bluesky, Facebook, Instagram, Threads and YouTube. To do that it holds sign-in tokens for <b>those RealUFO accounts only</b>. It never asks visitors to sign in with Google or any other service, and it never accesses visitors' accounts.</p>
<ul>
<li><b>YouTube API Services.</b> RealUFO uses YouTube API Services, with the <code>youtube.upload</code> permission, solely to upload videos to the RealUFO YouTube channel. By watching those videos you are bound by the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>; Google's handling of data is described in the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</li>
<li><b>Google user data.</b> The only Google data RealUFO holds is the OAuth token for the RealUFO channel's own Google account. It is stored as an encrypted server secret, used only to upload videos, and never shared, sold or used for advertising. RealUFO's use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
<li><b>Revoking access.</b> The account owner can revoke RealUFO's access at any time at <a href="https://security.google.com/settings/security/permissions">Google security settings</a> (and the equivalent settings of the other platforms). Revoked tokens are deleted from our servers on request.</li>
</ul>
<h2>Your choices</h2>
<p>Clearing your browser's site data resets your anonymous id. To have something you posted removed, email <a href="mailto:hello@realufo.org">hello@realufo.org</a> with a link to it.</p>
<p>Last updated ${PRIVACY_UPDATED}.</p>
`;
