---
target: web/src/screens/Doc.tsx
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/laichan/code/tung/realufo-superpower/web/src/screens/Doc.tsx"
target_fingerprint: "sha256:72c5e2c0d1cfe6a5da5acf1209786ba16ce987005fb740c1ea205bca5d7c4dc9"
target_path: /Users/laichan/code/tung/realufo-superpower/web/src/screens/Doc.tsx
timestamp: 2026-11-03T06-18-43Z
slug: web-src-screens-doc-tsx
---
Method: dual-agent (A: design review · B: detector + headless Chrome on production)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | PDF size probe, timecode, chrome fade good; verdict meaning hidden until vote |
| 2 | Match System / Real World | 2 | Icon-only verdicts (VerdictBar.tsx:76-90) and Summary/Full-text tabs (FullText.tsx:94-105); "ANON OK", "to a board", VIRIN jargon |
| 3 | User Control and Freedom | 3 | Esc/arrows/swipe/undo vote good; panel swipe changes file mid-scrub (Doc.tsx:432-441) |
| 4 | Consistency and Standards | 2 | 5 different discussion entry points; amber on "to a board" (Doc.tsx:1234) |
| 5 | Error Prevention | 3 | >30MB PDF gate (Doc.tsx:159, :772) |
| 6 | Recognition Rather Than Recall | 2 | ~13 transport/tool icons, tooltips only via title; phone toolbar hides 7 of them in an unhinted scroll row |
| 7 | Flexibility and Efficiency | 4 | Keys, ?t= ?p= view links, cite, .md/.json text |
| 8 | Aesthetic and Minimalist Design | 2 | ~18 stacked blocks; commerce and funnel interleaved with evidence |
| 9 | Error Recovery | 3 | LoadError + retry, thumb fallback, capture retry |
| 10 | Help and Documentation | 3 | MediaHelp + AI disclaimers; no explanation of verdict options |
| **Total** | | **27/40** | Good |

## Design Specificity Verdict
Top half authored for RealUFO (frame tools, official vs AI moments, release/VIRIN stamps, (p.N) deep links, "No official conclusion"). Bottom half (book shelf, funnel ticker, WTF-meter, comments, related grids) is generic content-site language.
Deterministic scan: source files (Doc.tsx + 20 imports) 0 findings. Live PDF page CIA-UAP-017: 99 (1280) / 105 (390) findings, ~91-95 undersized-ui-text (8.5-10.5px mono: DocCard related cards, facts labels, chips, ANON OK), 5-6 tiny-text, 1 line-length (~191 ch summary at desktop). False positives: scanline stripes, phosphor radial glow, mono tracking. Video page FBI-UAP-PR003: URL scan timed out. No overlay injected.

## Priority Issues
- [P1] Commerce before evidence: GoDeeper (Doc.tsx:1040) sits before Open original (:1044), source links (:1054), FullText (:1064). Fix: summary -> original + sources -> full text -> series; GoDeeper/FunnelStrip after discussion. /impeccable layout
- [P1] Metadata text too small: 8.5-10px mono for dates, places, ids, fact labels (DocCard, Doc.tsx:164). Fix: floor 11px for content, 10px only for stamps. /impeccable typeset
- [P1] Verdict meter icon-only and placed before reading (Doc.tsx:987); TL;DR conclusion blurred, reveal on a <p onClick> with no button role/keyboard (TldrCard.tsx:76-86). Fix: text labels, move after summary/full text, reveal as <button>. /impeccable clarify
- [P2] Discussion entry points x5 (Doc.tsx:992, :1155, :1183, :1245, :1285) + unlabelled sticky pill covering text. /impeccable distill
- [P2] Signal/amber misuse: TldrCard.tsx:60/:70/:80, Doc.tsx:1152 signal as decoration; amber on "to a board" (:1234) + AI disclaimer. /impeccable colorize
- [P2] Phone media toolbar: 587px content in 358px scroll row, no hint; desktop portrait video ~1870px tall before info. /impeccable adapt

## Persona Red Flags
Casey (phone): toolbar icons off-screen; swipe-to-next-file; sticky pill + nav ~120px; blurred reveal not a button.
Jordan (from a Short): TL;DR + icon verdicts + "? ? ?" before context; git-compare glyph; RELEASE 03 / VIRIN jargon.
Researcher: scrolls past Amazon shelf to full text; full-text tab defaults to AI summary with icon-only tabs; series prev/next buried.

## Minor Observations
- TldrCard.tsx:26 dead statement; :32 useState after early return (Rules of Hooks bug); onBoring unused; commented-out share code.
- Loose type ramp (8.5, 9, 10.5, 11.5, 13.5, 14.5, 17, 19px).
- Summary paragraph ~191 ch per line at desktop; cap 680px.
- Stance dot colour-only; skeptic = amber.
- Footer social icons 20x20 tap targets.
- "◂ promoted threads" glyph/lowercase head inconsistent.

## Questions to Consider
- Why is the AI TL;DR headline (17px bold) bigger than the h1 if the document is the authority?
- Does a crowd WTF-meter belong on a neutral evidence page?
- What if the page ended at full text + next file in the series?
