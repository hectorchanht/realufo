import json, pathlib
from ingest.seed_asks import local_sql, COLS

def test_local_sql_quotes_text_and_nulls_in_column_order():
    row = {"id": 5, "question": "Pilot's view?", "actor_id": "abc", "sources": 2, "cached": 0, "public": 1,
           "created_at": "2026-10-02 08:00:00", "answer": None}
    sql = local_sql([row])
    assert sql == ("INSERT OR REPLACE INTO ask_log(" + ",".join(COLS) + ") VALUES("
                   "'5','Pilot''s view?','abc','2','0','1','2026-10-02 08:00:00',NULL);\n")

def test_seed_questions_are_distinct_and_valid():
    qs = json.loads((pathlib.Path(__file__).parent.parent / "data" / "ask_seed.json").read_text())
    assert len(qs) >= 20
    assert len({q.lower() for q in qs}) == len(qs)
    assert all(isinstance(q, str) and 3 <= len(q) <= 300 for q in qs)
