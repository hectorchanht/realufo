from ingest.thumbs import todo, insert_sql

def _row(id, mime, role_url="u"):
    return {"id": id, "archive": "wargov", "kind": "x", "cdn_url": role_url, "mime": mime}

def test_todo_classifies_dedupes_and_limits_per_kind():
    rows = [_row("V1", "video/mp4", "full"), _row("V1", "video/mp4", "orig"),
            _row("V2", "video/mp4"), _row("I1", "image/jpeg"),
            _row("P1", "application/pdf"), _row("Z1", "text/plain")]
    got = todo(rows, limit=1)
    assert [(r["id"], r["media"]) for r in got] == [("V1", "video"), ("I1", "image"), ("P1", "pdf")]
    assert got[0]["cdn_url"] == "full" and got[0]["key"] == "thumbs/wargov/V1.jpg"

def test_insert_sql_is_idempotent_and_escaped():
    sql = insert_sql({"id": "O'X", "key": "thumbs/aaro/O'X.jpg"})
    assert "'thumb'" in sql and "WHERE NOT EXISTS" in sql and "O''X" in sql
    assert "https://assets.realufo.org/thumbs/aaro/" in sql

def test_crop_filter_keeps_valid_axis_only():
    from ingest.thumbs import crop_filter
    log = lambda c: f"[Parsed_cropdetect_0] x1:0 ... crop=999:999:0:0\n... crop={c}\n"
    assert crop_filter(log("606:-1078:656:1080")) == "crop=606:ih:656:0,"   # pillarbox, dark rows
    assert crop_filter(log("-1078:-1918:1080:1920")) == ""                 # all-black sample
    assert crop_filter(log("1280:528:0:96")) == "crop=1280:528:0:96,"      # letterbox, both valid
    assert crop_filter("no detection") == ""

def test_duration_sql_parses_ffprobe_or_skips():
    from ingest.thumbs import duration_sql
    assert duration_sql(962, "49.375000") == "UPDATE assets SET duration=49.375 WHERE id=962;"
    assert duration_sql(1, "N/A") is None and duration_sql(1, "") is None and duration_sql(1, "0") is None
