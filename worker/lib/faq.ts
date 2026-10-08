// /faq text: one trusted constant shared by the crawler body
// (worker/lib/pages.ts, which also emits FAQPage JSON-LD from FAQ_ITEMS)
// and the SPA screen (web/src/screens/Faq.tsx).
// aHtml is the rendered answer; aText is the plain-text twin for JSON-LD.
export const FAQ_ITEMS: { q: string; aHtml: string; aText: string }[] = [
  {
    q: "What is RealUFO?",
    aHtml: `RealUFO is an independent, open-source archive of declassified UAP records. Every file is mirrored verbatim from official government sources — from the U.S. Department of War's PURSUE release tranches to holdings from NARA, NASA, the FBI, the CIA and others. The archive is searchable and filterable, with AI summaries, discussion boards, a release tracker and an AI ask layer over the records.`,
    aText: `RealUFO is an independent, open-source archive of declassified UAP records. Every file is mirrored verbatim from official government sources — from the U.S. Department of War's PURSUE release tranches to holdings from NARA, NASA, the FBI, the CIA and others.`,
  },
  {
    q: "Is RealUFO affiliated with the U.S. government or the Department of War?",
    aHtml: `No. RealUFO is not operated by, affiliated with, endorsed by, or funded by any government. It is an independent archival project.`,
    aText: `No. RealUFO is not operated by, affiliated with, endorsed by, or funded by any government. It is an independent archival project.`,
  },
  {
    q: "Where do the records come from?",
    aHtml: `Official sources only: <a href="https://www.war.gov/UFO/">war.gov/UFO</a> (the PURSUE releases), NARA, NASA, the FBI, the CIA, the DOE and other agencies. Files are mirrored verbatim; where a source is unreachable we link back through the Wayback Machine.`,
    aText: `Official sources only: war.gov/UFO (the PURSUE releases), NARA, NASA, the FBI, the CIA, the DOE and other agencies. Files are mirrored verbatim; where a source is unreachable we link back through the Wayback Machine.`,
  },
  {
    q: "Does RealUFO say whether UFOs are extraterrestrial?",
    aHtml: `No. RealUFO is a presentation layer, not an interpretation layer — we don't label records "extraterrestrial", "explained" or "hoax". The documents speak for themselves.`,
    aText: `No. RealUFO is a presentation layer, not an interpretation layer — we don't label records "extraterrestrial", "explained" or "hoax". The documents speak for themselves.`,
  },
  {
    q: "Do I need an account to use RealUFO?",
    aHtml: `No. Browsing, searching and reading are free with no account, ever. Votes and posts are attributed to an anonymous browser id — see <a href="/privacy">/privacy</a> for what is stored.`,
    aText: `No. Browsing, searching and reading are free with no account, ever. Votes and posts are attributed to an anonymous browser id.`,
  },
  {
    q: "How do I cite a record?",
    aHtml: `Every record page has a cite tool that produces a ready-made citation with the record id, title, source agency and a permanent link. For bulk use, the <a href="/developers">public API</a> returns stable ids and canonical URLs.`,
    aText: `Every record page has a cite tool that produces a ready-made citation with the record id, title, source agency and a permanent link. For bulk use, the public API returns stable ids and canonical URLs.`,
  },
  {
    q: "Can I download the whole dataset?",
    aHtml: `Yes. The open dataset (record metadata plus page text, as JSONL) is on <a href="https://huggingface.co/datasets/realufo/realufo-uap-archive" target="_blank" rel="noopener">Hugging Face</a>, and there is a read-only <a href="/api/v1/openapi.json">public API</a> with docs at <a href="/developers">/developers</a>. There is also <a href="/llms.txt">llms.txt</a> and <a href="/feed.xml">RSS</a>.`,
    aText: `Yes. The open dataset (record metadata plus page text, as JSONL) is on Hugging Face, and there is a read-only public API with docs at /developers. There is also llms.txt and RSS.`,
  },
  {
    q: "How do I know when new files are released?",
    aHtml: `The <a href="/releases">release tracker</a> follows every Pentagon UFO file release with per-tranche file counts. You can also get new drops by <a href="/newsletter">email newsletter</a> or the <a href="/podcast">podcast</a>.`,
    aText: `The release tracker follows every Pentagon UFO file release with per-tranche file counts. You can also get new drops by email newsletter or the podcast.`,
  },
  {
    q: "I spotted a mistake — or I want a file added.",
    aHtml: `Mistakes (bad mirrors, wrong summaries, broken pages): <a href="https://github.com/hectorchanht/realufo/issues">open a GitHub issue</a>. Missing files: <a href="https://docs.google.com/forms/d/e/1FAIpQLSesgIQPmSYoGsR4n2nkKMp18enYripao1yezoO62kHtKPIqJw/viewform" target="_blank" rel="noopener">request it here</a> — anonymous, no account needed.`,
    aText: `Mistakes (bad mirrors, wrong summaries, broken pages): open a GitHub issue. Missing files: use the anonymous request form linked from the contact page.`,
  },
  {
    q: "Who runs RealUFO?",
    aHtml: `An independent project — the full source is on <a href="https://github.com/hectorchanht/realufo">GitHub</a>. Contact: <a href="mailto:hello@realufo.org">hello@realufo.org</a>.`,
    aText: `An independent project — the full source is on GitHub. Contact: hello@realufo.org.`,
  },
];

export const FAQ_HTML =
  `<p>Short answers to common questions about the archive. Still stuck? <a href="/contact">Contact us</a>.</p>\n` +
  FAQ_ITEMS.map(
    (f) => `<details>\n<summary><b>${f.q}</b></summary>\n<p>${f.aHtml}</p>\n</details>`,
  ).join("\n");
