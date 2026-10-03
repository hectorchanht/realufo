import json
import pytest
from ingest import tldr

ROW = {"id": "DOW-UAP-D084", "title": "Navy encounter off San Diego", "agency": "Navy", "kind": "video",
       "incident_date": "11/14/04", "location": "San Diego", "duration": 95.4,
       "summary": "Pilots of two F/A-18 jets observed an object at 2,000 feet for 5 minutes.",
       "ai_summary": None,
       "ai_moments": json.dumps({"model": "m", "generated_at": "t",
                                 "moments": [{"start": 35.2, "end": 40, "text": "Object enters frame."}]}),
       "input_hash": None}

GOOD = {"bullets": ["Navy pilots in two F/A-18 jets film an object off San Diego",
                    "They watch it for 5 min at 2000 ft",  # already compact: generate() compacts
                    "No official conclusion in the file"],
        "one_liner": "The object left; the filing cabinet stayed."}

def test_build_input_has_facts_and_texts():
    s = tldr.build_input(ROW)
    assert "Title: Navy encounter off San Diego" in s
    assert "Length: 1:35" in s
    assert "Official summary:\nPilots of two F/A-18" in s

def test_build_input_renders_moments_as_mmss():
    assert "AI key moments:\n0:35 Object enters frame." in tldr.build_input(ROW)

def test_build_input_skips_na_and_caps():
    row = {**ROW, "location": "N/A", "summary": "x" * 9000}
    s = tldr.build_input(row)
    assert "Location" not in s and len(s) <= tldr.INPUT_CAP

def test_input_hash_stable_and_changes_with_ai_summary():
    a = tldr.input_hash(tldr.build_input(ROW))
    assert a == tldr.input_hash(tldr.build_input(dict(ROW))) and len(a) == 64
    assert a != tldr.input_hash(tldr.build_input({**ROW, "ai_summary": "A memo."}))

def test_parse_reply_strips_think_and_trailing_prose():
    raw = '<think>hm</think> Sure: {"bullets": ["a","b","c"], "one_liner": "d"} hope {this} helps'
    assert tldr.parse_reply(raw) == {"bullets": ["a", "b", "c"], "one_liner": "d"}
    assert tldr.parse_reply("no json here") is None

def test_normalize_strips_markdown_markers():
    t = tldr.normalize({"bullets": ["- **Navy** pilots film it", "• 2004 sighting", "1. No conclusion"],
                        "one_liner": '"Even the redactions look nervous."'})
    assert t == {"bullets": ["Navy pilots film it", "2004 sighting", "No conclusion"],
                 "one_liner": "Even the redactions look nervous."}

def test_normalize_rejects_wrong_shape():
    assert tldr.normalize(None) is None
    assert tldr.normalize({"bullets": "a", "one_liner": "b"}) is None
    assert tldr.normalize({"bullets": ["a", 2, "c"], "one_liner": "b"}) is None

def test_check_accepts_good():
    assert tldr.check(GOOD, tldr.build_input(ROW)) is None

def test_check_rejects_invented_number():
    bad = {**GOOD, "bullets": ["Filmed in 1997", *GOOD["bullets"][1:]]}
    assert "1997" in tldr.check(bad, tldr.build_input(ROW))

def test_check_rejects_spelled_count_not_in_source():
    bad = {**GOOD, "one_liner": "Three jets, zero answers."}
    assert "three" in tldr.check(bad, tldr.build_input(ROW))

def test_check_accepts_spelled_count_matching_digit():
    # source says "5 minutes"; "Five" must pass via WORDNUM
    ok = {**GOOD, "one_liner": "Five minutes of footage, a lifetime of forms."}
    assert tldr.check(ok, tldr.build_input(ROW)) is None

def test_build_input_expands_two_digit_year():
    assert "Incident date: 11/14/04 (2004)" in tldr.build_input(ROW)
    assert "Incident date: 6/1/47 (1947)" in tldr.build_input({**ROW, "incident_date": "6/1/47"})
    assert "Incident date: 1965\n" in tldr.build_input({**ROW, "incident_date": "1965"})

def test_check_accepts_four_digit_year_of_short_date():
    ok = {**GOOD, "bullets": ["Navy pilots film an object off San Diego in 2004", *GOOD["bullets"][1:]]}
    assert tldr.check(ok, tldr.build_input(ROW)) is None

def test_check_accepts_timecode_from_moments():
    ok = {**GOOD, "bullets": [GOOD["bullets"][0], "Object enters frame at 0:35", GOOD["bullets"][2]]}
    assert tldr.check(ok, tldr.build_input(ROW)) is None

def test_check_normalizes_thousands_separators():
    src = tldr.build_input({**ROW, "summary": "Object at 2000 feet."})
    ok = {**GOOD, "bullets": ["Navy pilots film an object", "It sits at 2,000 feet", "No conclusion"]}
    assert tldr.check(ok, src) is None

def test_check_word_caps_and_count():
    long = " ".join(["word"] * 19)
    assert "bullets" in tldr.check({**GOOD, "bullets": [long, "b", "c"]}, "")
    assert "one-liner" in tldr.check({**GOOD, "one_liner": " ".join(["w"] * 16)}, "")
    assert "exactly 3" in tldr.check({**GOOD, "bullets": ["a", "b"]}, "")

def test_check_banned_words_unless_in_source():
    bad = {**GOOD, "one_liner": "Not aliens, just paperwork."}
    assert "aliens" in tldr.check(bad, tldr.build_input(ROW))
    assert tldr.check(bad, tldr.build_input({**ROW, "summary": ROW["summary"] + " No aliens."})) is None

def test_generate_retries_once_with_reason():
    calls = []
    def fake_chat(system, user, max_tokens, temperature):
        calls.append(user)
        bad = {**GOOD, "bullets": ["Filmed in 1997", *GOOD["bullets"][1:]]}
        return json.dumps(bad if len(calls) == 1 else GOOD)
    assert tldr.generate(ROW, chat=fake_chat) == GOOD
    assert len(calls) == 2 and "1997" in calls[1]

def test_generate_raises_after_two_failures():
    with pytest.raises(ValueError):
        tldr.generate(ROW, chat=lambda *a, **k: "nope")

def test_todo_picks_missing_and_changed():
    h = tldr.input_hash(tldr.build_input(ROW))
    rows = [{**ROW, "id": "a", "input_hash": None}, {**ROW, "id": "b", "input_hash": h},
            {**ROW, "id": "c", "input_hash": "old"}]
    assert [r["id"] for r in tldr.todo(rows)] == ["a", "c"]
    assert [r["id"] for r in tldr.todo(rows, force=True, limit=2)] == ["a", "b"]

def test_row_sql_upserts_and_clears_card():
    sql = tldr.row_sql("AARO-x's.pdf", GOOD, "h1")
    assert sql.startswith("INSERT INTO record_tldr(record_id,lang,bullets,one_liner,input_hash) VALUES('AARO-x''s.pdf','en',")
    assert "card_url=NULL" in sql and "ON CONFLICT(record_id,lang)" in sql

def liner(o):
    return {**GOOD, "one_liner": o}

# F2: object guesses, leaked labels, links and markup
def test_check_rejects_object_guess_unless_in_source():
    t = liner("The Navy's best guess: a weather balloon.")
    assert tldr.check(t, tldr.build_input(ROW))
    src = tldr.build_input({**ROW, "summary": ROW["summary"] + " AARO resolved it as a weather balloon."})
    assert tldr.check(t, src) is None
    assert "guess" in tldr.check(liner("Probably just a drone."), tldr.build_input(ROW))

def test_clean_strips_leaked_label():
    assert tldr._clean("Joke: Paperwork wins.") == "Paperwork wins."

def test_check_rejects_links_and_markup_unless_in_source():
    assert "links" in tldr.check(liner("Visit aaro.mil for more"), tldr.build_input(ROW))
    assert "markup" in tldr.check(liner("<b>x</b>"), tldr.build_input(ROW))
    src = tldr.build_input({**ROW, "summary": ROW["summary"] + " Report it at aaro.mil."})
    assert tldr.check(liner("Visit aaro.mil for more"), src) is None

# F3: number guard both ways
def test_check_numbers_from_length_moments_and_dates():
    src = tldr.build_input({**ROW, "duration": 125})  # Length: 2:05
    for b in ("A 2-minute video of an object", "It runs 125 seconds"):
        assert tldr.check({**GOOD, "bullets": [b, *GOOD["bullets"][1:]]}, src) is None, b
    assert tldr.check({**GOOD, "bullets": ["Object enters frame 35 seconds in", *GOOD["bullets"][1:]]},
                      tldr.build_input(ROW)) is None
    src = tldr.build_input({**ROW, "incident_date": "05/01/2022"})
    assert tldr.check({**GOOD, "bullets": ["Filmed May 1, 2022 off San Diego", *GOOD["bullets"][1:]]}, src) is None

def test_check_rejects_big_spelled_numbers_not_in_source():
    src = tldr.build_input({**ROW, "incident_date": "1965"})  # ROW's 11/14/04 holds a 14
    assert "fourteen" in tldr.check(liner("Fourteen jets, one form."), src)
    assert "dozen" in tldr.check(liner("A dozen pages, all redacted."), src)
    assert tldr.check(liner("Fourteen jets, one form."), tldr.build_input(ROW)) is None

def test_check_rejects_crutch_openers():
    for o in ("Paperwork so thick, even ghosts need clearance.", "Bureaucracy: 25 forms later.", "The paperwork won again."):
        assert "opener" in tldr.check({**GOOD, "one_liner": o}, tldr.build_input(ROW))
    assert tldr.check({**GOOD, "one_liner": "Five minutes of footage, a lifetime of paperwork."}, tldr.build_input(ROW)) is None

def test_generate_defaults_to_gpt_oss(monkeypatch):
    seen = []
    monkeypatch.setattr(tldr.cfapi, "respond", lambda instructions, text: seen.append((instructions, text)) or json.dumps(GOOD))
    assert tldr.generate(ROW) == GOOD
    assert seen and seen[0][0] == tldr.SYSTEM and "/no_think" not in seen[0][1]

def test_check_rejects_coffee_unless_in_source():
    o = {**GOOD, "one_liner": "The object never got its coffee break."}
    assert "coffee" in tldr.check(o, tldr.build_input(ROW))
    assert "coffee" not in (tldr.check(o, tldr.build_input({**ROW, "summary": ROW["summary"] + " Staff took a coffee break."})) or "")

def test_repeats_finds_shared_phrase():
    recent = ["Only 34 seconds of footage, but enough to fill a form."]
    assert tldr.repeats("Only 34 seconds of footage and the radar blinked.", recent) in {"only 34 seconds of", "34 seconds of footage"}
    assert tldr.repeats("The orbs toured the backyard in 49 seconds.", recent) is None
    assert tldr.repeats("anything", []) is None

def test_generate_retries_on_repeated_phrase():
    replies = [json.dumps(GOOD), json.dumps({**GOOD, "one_liner": "Navy jets, one object, no follow-up."})]
    calls = []
    def fake(system, user, **k):
        calls.append(user)
        return replies[len(calls) - 1]
    out = tldr.generate(ROW, chat=fake, recent=[GOOD["one_liner"]])
    assert out["one_liner"] == "Navy jets, one object, no follow-up." and "reused" in calls[1]

def test_check_rejects_more_object_guesses_unless_in_source():
    for o in ("Sweden called them celestial, but they were just early fireworks.",
              "Same angles on the same fishing fleet.", "Turns out it was flares.", "A meteor with a filing number."):
        assert "don't say" in (tldr.check({**GOOD, "one_liner": o}, tldr.build_input(ROW)) or ""), o
    src = tldr.build_input({**ROW, "summary": ROW["summary"] + " AARO assessed the objects as flares."})
    assert tldr.check({**GOOD, "one_liner": "Turns out it was flares."}, src) is None

# --- space-efficient TL;DRs: the og:description is one_liner + " — " + bullet 1 (~155 chars in a SERP)
def test_compact_abbreviates_units_numbers_and_agencies():
    t = {"bullets": ["DOW-UAP-PR143 video, Department of War, 2023, Yellow Sea",
                     "Five‑second FMV, then 34 minutes of radar at approximately 6 feet",
                     "A second object was seen; thirty-four seconds later it left"],
         "one_liner": "The sensor’s 19‑second cameo outlasts the 2 hours briefing."}
    c = tldr.compact(t, "DOW-UAP-PR143")
    assert c["bullets"][0] == "Video, DoW, 2023, Yellow Sea"
    assert c["bullets"][1] == "5 s FMV, then 34 min of radar at ~6 ft"
    assert c["bullets"][2] == "A second object was seen; thirty-four seconds later it left"  # no digit -> untouched
    assert c["one_liner"] == "The sensor’s 19 s cameo outlasts the 2 h briefing."

def test_check_caps_one_liner_plus_bullet_1_to_the_search_snippet():
    long_both = {**GOOD, "one_liner": "The object left the frame while the filing cabinet stayed exactly where it was.",
                 "bullets": ["Navy pilots in two F/A-18 jets film an object off San Diego during a routine exercise", *GOOD["bullets"][1:]]}
    assert "at most 152 characters" in tldr.check(long_both, tldr.build_input(ROW))
    long_later = {**GOOD, "bullets": [GOOD["bullets"][0], "They watch it for 5 min at 2000 ft off the coast near San Diego, then", GOOD["bullets"][2]]}
    assert tldr.check(long_later, tldr.build_input(ROW)) is None  # only bullet 1 is in the snippet

def test_check_accepts_digit_for_a_spelled_number_in_source():
    row = {**ROW, "summary": "Pilots watched an object for five minutes."}
    ok = {**GOOD, "bullets": ["Navy video off San Diego", "They watch it for 5 min", GOOD["bullets"][2]]}
    assert tldr.check(ok, tldr.build_input(row)) is None

def test_generate_compacts_before_check():
    reply = json.dumps({"bullets": ["DOW-UAP-D084 video, Navy, 2004, San Diego", "Watched for five minutes at 2000 feet",
                                    "No official conclusion in the file"], "one_liner": "Five minutes, one filing cabinet."})
    t = tldr.generate(ROW, chat=lambda *a, **k: reply)
    assert t["bullets"][:2] == ["Video, Navy, 2004, San Diego", "Watched for 5 min at 2000 ft"]
    assert t["one_liner"] == "5 min, one filing cabinet."

def test_recheck_rewrites_compactable_rows_without_the_model_and_regenerates_the_rest():
    stored = {"a": {"bullets": ["Navy video", "Watched for 5 minutes", "No official conclusion in the file"], "one_liner": "Short joke."},
              "b": {"bullets": GOOD["bullets"], "one_liner": "x" * 110},  # 110 + 3 + 59 > 155
              "c": {"bullets": ["Navy video", "Watched it", "No official conclusion in the file"], "one_liner": "Fine."}}
    rows = [{**ROW, "id": k} for k in ("a", "b", "c")]
    rewrite, regen = tldr.recheck_plan(rows, stored)
    assert [(r["id"], t["bullets"][1]) for r, t in rewrite] == [("a", "Watched for 5 min")]
    assert [r["id"] for r in regen] == ["b"]
