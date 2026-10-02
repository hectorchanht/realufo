import json
from ingest.moments import plan_segments, frame_times, speculative, problem, merge, doc_json, update_sql


def test_plan_segments_uses_cuts_merges_short_and_splits_long():
    # 1.0 leaves a 1 s head (merges forward); 38.5 leaves a 1.5 s tail (merges back);
    # the remaining 15-40 span is 25 s > 20 s window, so it splits in two.
    assert plan_segments(40.0, [1.0, 15.0, 38.5]) == [(0.0, 15.0), (15.0, 27.5), (27.5, 40.0)]
    assert plan_segments(35.0, [15.0]) == [(0.0, 15.0), (15.0, 35.0)]


def test_plan_segments_without_cuts_splits_evenly():
    segs = plan_segments(300.0, [])
    assert len(segs) == 15 and segs[0] == (0.0, 20.0) and segs[-1] == (280.0, 300.0)
    assert all(abs((e - s) - 20.0) < 1e-6 for s, e in segs)


def test_plan_segments_caps_long_videos_at_about_15():
    segs = plan_segments(1056.0, [])
    assert 14 <= len(segs) <= 15
    assert segs[0][0] == 0.0 and segs[-1][1] == 1056.0


def test_plan_segments_tiny_clip_is_one_moment():
    assert plan_segments(2.5, [1.2]) == [(0.0, 2.5)]
    assert plan_segments(0.0, []) == []


def test_frame_times_are_eighths():
    assert frame_times(0.0, 8.0) == [1.0, 3.0, 5.0, 7.0]


def test_speculation_filter_whole_words_case_insensitive():
    assert speculative("A UFO crosses the frame.")
    assert speculative("The object resembles an Aircraft.")
    assert not speculative("The sensor pans to keep an area of contrast in orbit view.")  # 'orbit' is not 'orb'
    assert not speculative("A light source moves left.")


def test_problem_flags_empty_long_and_speculative():
    assert problem("") == "empty"
    assert problem("word " * 61) == "too long"
    assert problem("A drone hovers.") == "speculative"
    assert problem("The sensor zooms in.") is None


def test_merge_folds_same_as_previous_runs():
    segs = [(0.0, 5.0), (5.0, 9.0), (9.0, 20.0)]
    res = [{"text": "Pan right.", "same_as_previous": False},
           {"text": "Still panning.", "same_as_previous": True},
           {"text": "Zoom in.", "same_as_previous": False}]
    assert merge(segs, res) == [{"start": 0.0, "end": 9.0, "text": "Pan right."},
                                {"start": 9.0, "end": 20.0, "text": "Zoom in."}]
    # a leading same_as_previous has nothing to fold into: kept
    assert merge([(0.0, 3.0)], [{"text": "X.", "same_as_previous": True}]) == [{"start": 0.0, "end": 3.0, "text": "X."}]


def test_doc_json_and_update_sql_escape_quotes_and_unicode():
    doc = doc_json([{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}], "m", "2026-10-02T00:00:00Z")
    parsed = json.loads(doc)
    assert parsed == {"model": "m", "generated_at": "2026-10-02T00:00:00Z",
                      "moments": [{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}]}
    sql = update_sql("O'X", doc)
    assert sql.startswith("UPDATE records SET ai_moments='") and "It''s" in sql and "id='O''X'" in sql
    assert "café" in sql
