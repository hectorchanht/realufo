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
