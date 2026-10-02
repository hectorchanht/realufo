import json, pathlib
from ingest.ask_eval import score

def test_score_counts_any_expected_source_as_hit():
    golden = [{"q": "a", "expect": ["R1"]}, {"q": "b", "expect": ["R2", "R3"]}, {"q": "c", "expect": ["R9"]}]
    answers = {"a": {"sources": [{"record_id": "R1"}]},
               "b": {"sources": [{"record_id": "R3"}]},
               "c": {"sources": []}}
    recall, misses = score(golden, answers)
    assert recall == 2 / 3 and misses == ["c"]

def test_golden_file_is_well_formed():
    data = json.loads((pathlib.Path(__file__).parent.parent / "data" / "ask_golden.json").read_text())
    assert len(data) == 10
    assert all(set(g) == {"q", "expect"} and g["expect"] for g in data)
