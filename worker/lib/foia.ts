// /foia text: one trusted HTML constant shared by the crawler body
// (worker/lib/pages.ts) and the SPA screen (web/src/screens/Foia.tsx).
// Filing freedom-of-information requests is how archives like this grow.
// The legacy static site keeps the full per-jurisdiction letter templates.
export const FOIA_HTML = `
<p>Filing freedom-of-information requests is how archives like this one grow. Every statute below has the same shape: a specific law, a specific office, and a request specific enough to be answerable.</p>
<h2>USA — FOIA (5 U.S.C. § 552)</h2>
<ul>
<li>File through each agency's online FOIA portal. For UAP specifically: the <a href="https://www.aaro.mil/" target="_blank" rel="noopener">AARO FOIA office</a>, the federal hub at <a href="https://www.foia.gov/" target="_blank" rel="noopener">foia.gov</a>, and the <a href="https://catalog.archives.gov/" target="_blank" rel="noopener">NARA catalog</a> for declassified Blue Book material.</li>
<li>Name the records concretely: event, date, unit, file number — e.g. "AFOSI sighting reports from Kirtland AFB, June–August 1980", not "all UAP records".</li>
<li>Ask for digital delivery (PDF / WAV / MP4) and state non-commercial, public-interest use where the statute supports a fee waiver.</li>
</ul>
<h2>Other jurisdictions</h2>
<ul>
<li><b>UK</b> — FOIA 2000 via the MoD's FOI form; accessioned files via TNA Discovery.</li>
<li><b>France</b> — Loi nº 78-753; most GEIPAN material is already public, CADA handles refusals.</li>
<li><b>Brazil</b> — Lei nº 12.527/2011 (LAI) via the e-SIC portal.</li>
<li><b>Chile</b> — Ley nº 20.285 via the Portal de Transparencia.</li>
<li><b>Argentina</b> — Ley nº 27.275; <b>Uruguay</b> — Ley nº 18.381; <b>Peru</b> — Ley nº 27.806; <b>Spain</b> — Ley nº 19/2013; <b>Italy</b> — D.lgs. 33/2013; <b>Canada</b> — ATIA; <b>New Zealand</b> — OIA 1982.</li>
</ul>
<h2>Tips that increase response rates</h2>
<ul>
<li><b>Be specific.</b> "All UAP records 1947–present" gets a form-letter denial; a named incident with a date range gets results.</li>
<li><b>Cite file references where known.</b> DEFE 24/1948, RG 341, VIRINs — the agency's own catalog IDs short-circuit the search.</li>
<li><b>Pre-check the catalogue.</b> NARA, TNA Discovery and other national archives have public search; the file you want is sometimes already accessioned and just needs a copy order.</li>
<li><b>One statute, one agency, one subject.</b> Combined requests get pinballed between offices.</li>
<li><b>Pursue partial denials.</b> Most statutes require the agency to name the exemption; a targeted appeal often unlocks redacted sections.</li>
<li><b>Share results.</b> Obtained something previously unreleased? <a href="https://github.com/hectorchanht/realufo/issues">Open an issue</a> and we will mirror it.</li>
</ul>
<p>The full per-jurisdiction walkthrough with copy-paste letter templates lives on the <a href="https://release.realufo.org/foia/">original static edition's FOIA guide</a>.</p>
`;
