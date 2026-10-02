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
