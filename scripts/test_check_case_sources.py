#!/usr/bin/env python3
"""Checks scripts/check_case_sources.py's source parser (run: python3 scripts/test_check_case_sources.py)."""
import importlib.util, pathlib

spec = importlib.util.spec_from_file_location("ccs", pathlib.Path(__file__).with_name("check_case_sources.py"))
ccs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ccs)

ts = '''sources: [{ id: "A-1", page: 3, note: "n" }, { url: "https://x.test/a", note: "n" },
  { "id": "B-2", "page": 5, "note": "json style" }, { "url": "https://y.test/b", "note": "n" }, { id: "C-3", note: "no page" }]'''
ids, urls = ccs.parse(ts)
assert ids == [("A-1", "3"), ("B-2", "5"), ("C-3", "")], ids
assert urls == ["https://x.test/a", "https://y.test/b"], urls
print("ok: check_case_sources parser")
