// /terms text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/Terms.tsx).
export const TERMS_UPDATED = "2026-10-03";

export const TERMS_HTML = `
<p>RealUFO (realufo.org) is an independent, non-commercial archive of declassified, public-domain UAP records. By using the site you agree to these terms.</p>
<h2>The archive</h2>
<ul>
<li><b>Source records.</b> Files come from public U.S. government releases (war.gov, AARO, NARA, NASA and others). RealUFO is not affiliated with or endorsed by any government agency.</li>
<li><b>No warranty.</b> The site is provided as-is. AI summaries, TL;DRs and Ask answers are generated automatically and can be wrong; check the original file before relying on them.</li>
</ul>
<h2>What you post</h2>
<ul>
<li>You are responsible for the comments, threads, votes and images you post. Everything you post is public.</li>
<li>Don't post anything illegal, infringing, harassing, sexual, or personal information about others. Only upload images you have the right to share.</li>
<li>By posting, you let RealUFO display and share that content on the site and on its social accounts.</li>
<li>We may remove content or limit access at any time. Child sexual abuse material is reported to the authorities.</li>
</ul>
<h2>Social accounts</h2>
<p>RealUFO posts archive content to its own accounts on X, Bluesky, Facebook, Instagram, Threads, YouTube and TikTok, subject to each platform's terms. See the <a href="/privacy">privacy policy</a> for how the site handles data.</p>
<h2>Liability and changes</h2>
<p>To the extent the law allows, RealUFO is not liable for any loss arising from use of the site. These terms may change; the date below shows the latest version. Questions or takedown requests: <a href="mailto:hello@realufo.org">hello@realufo.org</a>.</p>
<p>Last updated ${TERMS_UPDATED}.</p>
`;
