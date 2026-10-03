-- Case stories fact-check (spec 2026-10-03-realufo-case-stories-design): two
-- lede details the primary files contradict.
-- Socorro: Zamora's FBI statement and the Air Force summary put the flame to the
-- southwest, not the west. Kaikoura: on 20/21 December two Argosy freighters flew
-- (RNZAF report, AIR 1080/6/897), not one.
UPDATE cases SET lede = replace(lede, 'in an arroyo to his west.', 'in an arroyo to his southwest.') WHERE slug = 'socorro';
UPDATE cases SET lede = replace(lede,
  'On 21 December 1978, a Safe Air Argosy freighter on a night cargo run reported multiple unidentified luminous objects pacing the aircraft over Cook Strait and the Kaikoura coast.',
  'On the night of 20/21 December 1978, the crews of two Safe Air Argosy freighters on night cargo runs reported multiple unidentified lights off the Kaikoura coast, some appearing to follow the aircraft on radar.')
  WHERE slug = 'kaikoura';
