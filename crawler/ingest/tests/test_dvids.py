import os
from ingest.dvids import parse_page, location_from_title, update_sql, neutral_sql

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "dvids-977221.html")


def test_parse_page_reads_title_description_date_virin_filename():
    m = parse_page(open(FIX, encoding="utf-8").read())
    assert m["title"] == "PR-004, UAP Report Resolved as a Balloon, Europe 2022"
    assert m["dod"] == "111300649"
    assert m["virin"] == "220101-O-D0360-1702"
    assert m["year"] == "2022"
    assert m["description"].startswith("The United States European Command submitted a report")
    assert "almost certainly (≥95% likelihood) a balloon" in m["description"]
    assert "VIDEO INFO" not in m["description"] and "Date Taken" not in m["description"]


def test_location_from_title_handles_both_aaro_title_styles():
    assert location_from_title("PR-004, UAP Report Resolved as a Balloon, Europe 2022") == "Europe"
    assert location_from_title("Unresolved UAP Report: Middle East 2024") == "Middle East"
    assert location_from_title("South Asian Object 1") is None
    assert location_from_title("GIMBAL - UAP") is None


def test_update_sql_escapes_and_keeps_location_when_unknown():
    meta = {"title": "Rock's Object", "description": "It's “round”.", "virin": "V-1", "year": "2015"}
    sql = update_sql("AARO-DOD_1", meta)
    assert sql.startswith("UPDATE records SET title='Rock''s Object'")
    assert "summary='It''s “round”.'" in sql and "virin='V-1'" in sql and "incident_date='2015'" in sql
    assert "location=COALESCE(NULL,location)" in sql and sql.endswith("WHERE id='AARO-DOD_1';")
    assert "location=COALESCE('Europe',location)" in update_sql("X", {**meta, "title": "PR-1, Unresolved UAP Report, Europe 2022"})


def test_neutral_sql_only_touches_the_bad_gimbal_title():
    sql = neutral_sql("AARO-DOD_110956846", "110956846")
    assert "title='AARO video · DOD_110956846 (original title not published)'" in sql
    assert "summary=NULL" in sql
    assert "WHERE id='AARO-DOD_110956846' AND title LIKE 'NAVAIR - FOIA: Unresolved Case: GIMBAL Video%';" in sql


def test_year_prefers_a_year_named_in_the_title():
    base = {"description": "", "virin": None}
    assert "incident_date='2021'" in update_sql("X", {**base, "title": "Navy 2021 Flyby video", "year": "2022"})
    assert "incident_date='2022'" in update_sql("X", {**base, "title": "PR-004, Resolved as a Balloon, Europe 2022", "year": "2022"})
    assert "incident_date='2015'" in update_sql("X", {**base, "title": "GIMBAL - UAP", "year": "2015"})
