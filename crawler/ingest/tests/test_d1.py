from ingest.models import Candidate, R2_BASE
from ingest.d1 import sql_q, emit_sql

def _c(**kw):
    base = dict(id="AARO-X", archive="aaro", agency="AARO", agency_full="AARO",
                title="O'Brien Case", summary="s", incident_date="", location="",
                doc_date="", kind="image", redacted=0, virin="",
                r2_key="images/aaro/x.jpg", cdn_url=f"{R2_BASE}/images/aaro/x.jpg",
                mime="image/jpeg", thumb_url=f"{R2_BASE}/images/aaro/x.jpg")
    base.update(kw); return Candidate(**base)

def test_sql_q_escapes_apostrophes_and_null():
    assert sql_q("") == "NULL"
    assert sql_q("O'Brien") == "'O''Brien'"

def test_emit_sql_has_records_assets_and_new_archive():
    sql = emit_sql([_c()], {"aaro": {"label": "AARO", "flag": "🇺🇸", "accent": "#6ea8ff", "coord": "Pentagon"}})
    assert "INSERT OR IGNORE INTO archives" in sql
    assert "INSERT OR IGNORE INTO records" in sql and "'AARO-X'" in sql
    assert "INSERT INTO assets" in sql and "'full'" in sql and "'thumb'" in sql
    assert "O''Brien" in sql            # escaped

def test_emit_sql_no_thumb_when_absent():
    sql = emit_sql([_c(thumb_url="")], {})
    assert "'thumb'" not in sql and "'full'" in sql
