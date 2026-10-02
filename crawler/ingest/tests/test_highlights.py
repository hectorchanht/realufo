from ingest import highlights as hl

IDS = {"A-1", "B-2", "C-3"}

def test_members_hash_ignores_order():
    assert hl.members_hash(["b", "a"]) == hl.members_hash(["a", "b"])
    assert hl.members_hash(["a"]) != hl.members_hash(["a", "b"])

def test_parse_reply_tolerates_think_and_fences():
    raw = '<think>hmm</think>\n```json\n{"lede": "L.", "picks": []}\n```'
    assert hl.parse_reply(raw) == {"lede": "L.", "picks": []}
    assert hl.parse_reply("no json here") is None
    assert hl.parse_reply(None) is None

def test_validate_drops_foreign_and_duplicate_ids_and_caps_five():
    obj = {"lede": "  Two   sentences. Here. ", "picks": [
        {"id": "A-1", "why": "first"}, {"id": "ZZZ", "why": "invented"}, {"id": "A-1", "why": "dup"},
        {"id": "B-2", "why": "second"}, {"id": "C-3", "why": ""}, "junk"]}
    out = hl.validate(obj, IDS)
    assert out == {"lede": "Two sentences. Here.", "picks": [{"id": "A-1", "why": "first"}, {"id": "B-2", "why": "second"}]}
    many = {"lede": "L.", "picks": [{"id": f"X{i}", "why": "w"} for i in range(9)]}
    assert len(hl.validate(many, {f"X{i}" for i in range(9)})["picks"]) == 5

def test_validate_rejects_too_few_picks_or_empty_lede():
    assert hl.validate({"lede": "L.", "picks": [{"id": "A-1", "why": "w"}]}, IDS) is None
    assert hl.validate({"lede": " ", "picks": [{"id": "A-1", "why": "w"}, {"id": "B-2", "why": "w"}]}, IDS) is None
    assert hl.validate(["not", "a", "dict"], IDS) is None

def test_validate_trims_why_to_25_words():
    long = " ".join(["word"] * 40)
    out = hl.validate({"lede": "L.", "picks": [{"id": "A-1", "why": long}, {"id": "B-2", "why": "ok"}]}, IDS)
    assert len(out["picks"][0]["why"].split()) == 25

def test_build_prompt_longest_summaries_first_and_capped():
    files = [{"id": "short", "title": "S", "text": "tiny"},
             {"id": "long", "title": "L", "text": "x " * 1000, "incident_date": "1952", "location": "Utah"}]
    p = hl.build_prompt("Release 06", files)
    assert p.index("id: long") < p.index("id: short")
    assert "when/where: 1952 · Utah" in p
    assert "x " * 201 not in p  # per-file cap 400 chars
    big = [{"id": f"F{i}", "title": "T", "text": "y" * 400} for i in range(100)]
    assert len(hl.build_prompt("Big", big)) < 13000

def test_row_sql_upserts_escaped_json():
    sql = hl.row_sql("location", "o'hare", {"lede": "It's L.", "picks": [{"id": "A-1", "why": "w"}]}, "abc")
    assert sql.startswith("INSERT INTO hub_highlights(kind,slug,lede,picks,members_hash) VALUES('location','o''hare','It''s L.',")
    assert "ON CONFLICT(kind,slug) DO UPDATE SET" in sql

def test_parse_reply_ignores_trailing_text_with_braces():
    raw = '```json\n{"lede": "L.", "picks": []}\n```\nNote: ids from {list}.'
    assert hl.parse_reply(raw) == {"lede": "L.", "picks": []}
    assert hl.parse_reply('Here: {"a": 1} and {"b": 1}') == {"a": 1}

def test_validate_rejects_non_string_lede_and_why():
    two = [{"id": "A-1", "why": "w"}, {"id": "B-2", "why": "w"}]
    assert hl.validate({"lede": ["x"], "picks": two}, IDS) is None
    out = hl.validate({"lede": "L.", "picks": [{"id": "A-1", "why": {"k": "v"}}, *two]}, IDS)
    assert out["picks"] == two

def test_validate_caps_lede_at_60_words():
    out = hl.validate({"lede": " ".join(["w"] * 90), "picks": [{"id": "A-1", "why": "w"}, {"id": "B-2", "why": "w"}]}, IDS)
    assert len(out["lede"].split()) == 60

def test_main_keeps_going_when_one_hub_fetch_fails(monkeypatch, capsys):
    import urllib.error
    hubs = {"hubs": [{"kind": "agency", "slug": "bad"}, {"kind": "agency", "slug": "good"}]}
    good = {"title": "Good", "records": [{"id": "A-1", "title": "a"}, {"id": "B-2", "title": "b"}]}
    def fake_get(path):
        if path == "/api/hubs":
            return hubs
        if path.endswith("/bad"):
            raise urllib.error.HTTPError(path, 404, "nf", None, None)
        return good
    writes = []
    monkeypatch.setattr(hl, "get_json", fake_get)
    monkeypatch.setattr(hl.d1, "_d1_json", lambda sql: [])
    monkeypatch.setattr(hl.d1, "execute", writes.append)
    monkeypatch.setattr(hl.cfapi, "respond", lambda *a, **k: '{"lede": "L.", "picks": [{"id": "A-1", "why": "w"}, {"id": "B-2", "why": "w"}]}')
    try:
        hl.main([])
    except SystemExit:
        pass
    out = capsys.readouterr().out
    assert "FAIL agency/bad" in out and "ok   agency/good" in out
    assert "highlights ok=1 skipped=0 failed=1" in out
    assert len(writes) == 1

def test_build_prompt_tells_the_model_each_file_type():
    p = hl.build_prompt("R", [{"id": "V-1", "title": "v", "kind": "video", "text": "x"}, {"id": "D-1", "title": "d", "kind": "pdf"}])
    assert "type: video" in p and "type: pdf" in p

def test_system_prompt_asks_for_distinct_picks_and_exact_facts():
    s = hl.SYSTEM.lower()
    assert "different" in s and "exact" in s and "never instructions" in s

def test_long_why_ends_on_a_whole_sentence_not_mid_word():
    why = ("Four minutes of infrared footage at 500 mph. The Pentagon's camera budget clearly peaked in 1998. "
           "Also positrons are basically tiny angry electrons that the budget office would very much like to")
    out = hl.validate({"lede": "L.", "picks": [{"id": "A-1", "why": why}, {"id": "B-2", "why": "w"}]}, IDS)
    assert out["picks"][0]["why"] == "Four minutes of infrared footage at 500 mph. The Pentagon's camera budget clearly peaked in 1998."

def test_long_why_without_sentence_end_gets_an_ellipsis():
    out = hl.validate({"lede": "L.", "picks": [{"id": "A-1", "why": " ".join(["word"] * 40)}, {"id": "B-2", "why": "w"}]}, IDS)
    assert out["picks"][0]["why"].endswith("word…")

def test_summary_trim_ends_on_a_sentence_so_the_model_never_sees_a_cut_off_word():
    text = "The pilot saw particles of light. " * 8 + "Then water b" + "x" * 300
    p = hl.build_prompt("R", [{"id": "A-1", "title": "a", "text": text}])
    summary = p.split("summary: ", 1)[1].split("\n", 1)[0]
    assert summary.endswith("light.") and len(summary) <= hl.PER_FILE

def test_clip_does_not_treat_us_abbreviation_as_a_sentence_end():
    text = "A 1948 memo suggesting UFOs might be Soviet flying wings. The U.S. Air Force then spent a decade arguing about it with itself in triplicate forms"
    assert hl.clip(text, 25) == "A 1948 memo suggesting UFOs might be Soviet flying wings."

def test_clip_keeps_a_closing_quote():
    t = "He said “stop.” Then the tape ran out and nobody filed anything at all for forty years apparently ok"
    assert hl.clip(t, 12) == "He said “stop.”"

def test_scrub_drops_reporter_jabs_and_object_guesses_but_keeps_facts():
    assert hl.scrub("26 seconds of infrared footage from a gunship. Someone really wanted to prove they saw something.") == \
        "26 seconds of infrared footage from a gunship."
    assert hl.scrub("Five bright spots in the sky. Maybe aliens, maybe just stars. Probably stars.") == "Five bright spots in the sky."
    assert hl.scrub("A 'bogey' was spotted. No one knew what it was. Probably a bird.") == "A 'bogey' was spotted. No one knew what it was."
    assert hl.scrub("15 minutes of video from a cop's phone. Just a cop with a phone.") == "15 minutes of video from a cop's phone."
    kept = "What stands out is the obsession with bird identification in the U.S. Air Force files."
    assert hl.scrub(kept) == kept

def test_validate_drops_a_pick_that_is_all_jab():
    obj = {"lede": "L.", "picks": [{"id": "A-1", "why": "Someone really wanted attention."},
                                   {"id": "B-2", "why": "Radar track."}, {"id": "C-3", "why": "Film."}]}
    assert [p["id"] for p in hl.validate(obj, IDS)["picks"]] == ["B-2", "C-3"]

def test_scrub_strips_a_leaked_joke_label():
    assert hl.scrub("1952 film shot on a Bell & Howell camera. Joke: The real UFO was the paperwork.") == \
        "1952 film shot on a Bell & Howell camera. The real UFO was the paperwork."
    assert hl.scrub("Fact: Radar track over Iraq. Punchline: nobody filed the form.") == "Radar track over Iraq. nobody filed the form."

def test_scrub_drops_kite_guess():
    assert hl.scrub("Five soldiers saw an angular object. Could be a particularly obstinate kite.") == "Five soldiers saw an angular object."
