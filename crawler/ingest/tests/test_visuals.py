import json
from ingest import visuals

LONG = ("A grayscale infrared frame shows a small bright oval near the center against a dark, even background. "
        "Sensor overlay text runs along the top and left edges, with a crosshair and range markings around the object.")

def test_clean_reads_guided_json_dict_or_string():
    assert visuals.clean_description({"description": LONG}) == LONG
    assert visuals.clean_description(json.dumps({"description": LONG})) == LONG

def test_clean_rejects_empty_short_or_garbage():
    assert visuals.clean_description(None) is None
    assert visuals.clean_description({"description": "A photo."}) is None
    assert visuals.clean_description("not json at all") is None

def test_clean_collapses_whitespace_and_caps_at_a_sentence():
    raw = {"description": "  " + " ".join(f"Detail {i} is visible in the frame." for i in range(60)) + "  "}
    out = visuals.clean_description(raw)
    assert len(out.split()) <= visuals.MAX_WORDS and out.endswith(".") and "  " not in out

def test_prompt_carries_title_and_caption_as_data():
    t = visuals.prompt_text({"title": "Go Fast UAP", "summary": "AARO case-resolution imagery: Go Fast UAP"})
    assert "Go Fast UAP" in t and "AARO case-resolution imagery" in t and "<<<" in t
    assert "Official caption" not in visuals.prompt_text({"title": "X", "summary": ""})  # no empty caption block

def test_row_sql_creates_a_text_row_without_pages_and_never_touches_existing_pages():
    sql = visuals.row_sql("AARO-IMG-x's", "Desc.")
    assert sql.startswith("INSERT INTO record_text(record_id,pages,truncated,total_pages,ai_summary) VALUES('AARO-IMG-x''s','[]',0,0,'Desc.')")
    assert "ON CONFLICT(record_id) DO UPDATE SET ai_summary=excluded.ai_summary" in sql
    assert "pages=" not in sql.split("DO UPDATE")[1]

def test_select_only_live_images_without_ai_text():
    sql = " ".join(visuals.SELECT.format(ids="", limit="").split())
    assert "r.kind='image'" in sql and "r.status='live'" in sql
    assert "t.ai_summary IS NULL" in sql and "a.role='full'" in sql

def test_dry_run_calls_model_but_writes_nothing(monkeypatch):
    rows = [{"id": "IMG-1", "title": "T", "summary": "", "cdn_url": "https://cdn/x.png"}]
    monkeypatch.setattr(visuals.d1, "_d1_json", lambda sql: rows)
    monkeypatch.setattr(visuals, "image_jpeg", lambda url, work: b"\xff\xd8jpg")
    seen = {}
    def fake_vision(system, text, jpeg, schema, max_tokens=200):
        seen["schema"], seen["jpeg"] = schema, jpeg
        return {"description": LONG}
    monkeypatch.setattr(visuals.cfapi, "vision_json", fake_vision)
    writes = []
    monkeypatch.setattr(visuals, "flush", lambda lines, work: writes.append(lines))
    try:
        visuals.main(["--dry-run"])
    except SystemExit as e:
        assert e.code == 0
    assert writes == [] and seen["jpeg"] == b"\xff\xd8jpg"
    assert seen["schema"]["required"] == ["description"]

def test_failures_are_counted_and_skipped(monkeypatch, capsys):
    rows = [{"id": "IMG-1", "title": "T", "summary": "", "cdn_url": "u1"}, {"id": "IMG-2", "title": "T", "summary": "", "cdn_url": "u2"}]
    monkeypatch.setattr(visuals.d1, "_d1_json", lambda sql: rows)
    monkeypatch.setattr(visuals, "image_jpeg", lambda url, work: b"j")
    replies = iter([{"description": "too short"}, {"description": LONG}])
    monkeypatch.setattr(visuals.cfapi, "vision_json", lambda *a, **k: next(replies))
    writes = []
    monkeypatch.setattr(visuals, "flush", lambda lines, work: writes.append(lines))
    try:
        visuals.main([])
    except SystemExit as e:
        assert e.code == 1  # a failure → non-zero so the workflow log shows it
    assert len(writes) == 1 and len(writes[0]) == 1 and "IMG-2" in writes[0][0]
    assert "failed=1" in capsys.readouterr().out
