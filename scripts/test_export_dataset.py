#!/usr/bin/env python3
"""Checks for scripts/export_dataset.py's row builders (run: python3 scripts/test_export_dataset.py)."""
import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location("export_dataset", pathlib.Path(__file__).with_name("export_dataset.py"))
ed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ed)

detail = {
    "record": {
        "id": "DOW-UAP-D055", "archive": "wargov", "agency": "DoW", "agency_full": "Department of War",
        "title": "DOW-UAP-D055, Mission Report, Syria, November 2016", "summary": "Official summary.",
        "kind": "pdf", "incident_date": "11/18/16", "location": "Syria", "doc_date": "5/8/26",
        "source_url": "https://www.war.gov/x.pdf", "source_site": "wargov", "license": "public-domain-usgov",
        "status": "live", "ai_moments": "AI text that must not ship",
    },
    "release": {"no": 1, "date": "2026-05-08"},
    "fullText": {"aiSummary": "AI summary that must not ship"},
}
row = ed.record_row(detail)
assert row["id"] == "DOW-UAP-D055"
assert row["realufo_url"] == "https://realufo.org/doc/DOW-UAP-D055"
assert row["file_url"] == "https://realufo.org/api/file/DOW-UAP-D055"
assert row["release"] == 1 and row["agency"] == "Department of War"
assert row["summary"] == "Official summary."
assert "AI" not in " ".join(str(v) for v in row.values()), "AI-generated text must not be exported"
assert set(row) == set(ed.RECORD_FIELDS), sorted(set(row) ^ set(ed.RECORD_FIELDS))

odd = ed.record_row({"record": {**detail["record"], "id": "AARO-Case_Resolution_of _Western_United_States_Uap_508-02262024.pdf"}, "release": None})
assert odd["realufo_url"] == "https://realufo.org/doc/AARO-Case_Resolution_of%20_Western_United_States_Uap_508-02262024.pdf"
assert odd["release"] is None

pages = ed.page_rows("DOW-UAP-D055", {"pages": [{"n": 1, "text": " a "}, {"n": 2, "text": ""}, {"n": 3, "text": "c"}]})
assert pages == [{"id": "DOW-UAP-D055", "page": 1, "text": "a"}, {"id": "DOW-UAP-D055", "page": 3, "text": "c"}]

problems = ed.check([row], pages, expected=1)
assert problems == [], problems
assert ed.check([row], pages, expected=2) == ["1 records exported, site lists 2"]
assert ed.check([row, row], [], expected=2) == ["duplicate record id DOW-UAP-D055"]
assert ed.check([row], [{"id": "NOPE", "page": 1, "text": "x"}], expected=1) == ["page rows for unknown record NOPE"]
assert ed.is_open({"license": "public-domain-usgov"}) and ed.is_open({"license": "cc-by-4.0"})
assert not ed.is_open({"license": "lac-noncommercial"}) and not ed.is_open({"license": None})
print("ok: export_dataset row builders")
