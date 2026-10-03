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


def test_merge_folds_consecutive_identical_texts():
    segs = [(0.0, 5.0), (5.0, 9.0), (9.0, 20.0), (20.0, 30.0)]
    res = [{"text": "A light source moves right."}, {"text": " a light source  moves right. "},
           {"text": "Zoom in."}, {"text": "A light source moves right."}]
    assert merge(segs, res) == [{"start": 0.0, "end": 9.0, "text": "A light source moves right."},
                                {"start": 9.0, "end": 20.0, "text": "Zoom in."},
                                {"start": 20.0, "end": 30.0, "text": "A light source moves right."}]


def test_doc_json_and_update_sql_escape_quotes_and_unicode():
    doc = doc_json([{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}], "m", "2026-10-02T00:00:00Z")
    parsed = json.loads(doc)
    assert parsed == {"model": "m", "generated_at": "2026-10-02T00:00:00Z",
                      "moments": [{"start": 0.0, "end": 4.5, "text": "It's a “focus box” — café"}]}
    sql = update_sql("O'X", doc)
    assert sql.startswith("UPDATE records SET ai_moments='") and "It''s" in sql and "id='O''X'" in sql
    assert sql.endswith("UPDATE text_index SET status='failed' WHERE record_id='O''X';")   # Ask re-embeds it
    assert "café" in sql


import pytest
from ingest.moments import parse_scene_cuts, parse_model_output, moments_for, Skip


def test_parse_scene_cuts_reads_showinfo_pts_time():
    log = ("[Parsed_showinfo_2 @ 0x1] n:   0 pts:  12 pts_time:4.004   duration:1\n"
           "noise line\n"
           "[Parsed_showinfo_2 @ 0x1] n:   1 pts:  99 pts_time:17.5    duration:1\n")
    assert parse_scene_cuts(log) == [4.004, 17.5]
    assert parse_scene_cuts("") == []


def test_parse_model_output_accepts_object_string_and_fenced():
    ok = {"text": "The sensor pans."}
    assert parse_model_output(ok) == ok
    assert parse_model_output(json.dumps(ok)) == ok
    assert parse_model_output("```json\n" + json.dumps(ok) + "\n```") == ok
    assert parse_model_output({"text": "  x ", "extra": 1}) == {"text": "x"}
    assert parse_model_output("not json") is None
    assert parse_model_output({"other": True}) is None
    assert parse_model_output(None) is None


def _fakes(texts):
    calls = []
    def describe(jpeg, start, end, reminder=False):
        calls.append((start, end, reminder))
        return {"text": texts[len(calls) - 1]}
    return describe, calls


def test_moments_for_happy_path_counts_calls():
    describe, calls = _fakes(["Pan right.", "Zoom in."])
    row = {"id": "V1", "cdn_url": "u", "duration": 35.0}
    moments, n = moments_for(row, describe, cuts_fn=lambda url, d: [15.0],
                             grid_fn=lambda url, times, out: open(out, "wb").write(b"jpg"),
                             probe_fn=lambda url: "")
    assert moments == [{"start": 0.0, "end": 15.0, "text": "Pan right."},
                       {"start": 15.0, "end": 35.0, "text": "Zoom in."}]
    assert n == 2 and [c[:2] for c in calls] == [(0.0, 15.0), (15.0, 35.0)]


def test_moments_for_retries_speculation_once_then_skips():
    describe, calls = _fakes(["A drone appears.", "A drone appears."])
    row = {"id": "V1", "cdn_url": "u", "duration": 10.0}
    with pytest.raises(Skip):
        moments_for(row, describe, cuts_fn=lambda u, d: [], grid_fn=lambda u, t, o: open(o, "wb").write(b"j"),
                    probe_fn=lambda u: "")
    assert len(calls) == 2 and calls[1][2] is True   # second try carries the reminder


def test_moments_for_skips_when_grid_fails():
    describe, _ = _fakes([])
    def bad_grid(u, t, o):
        raise RuntimeError("ffmpeg died")
    with pytest.raises(Skip):
        moments_for({"id": "V", "cdn_url": "u", "duration": 9.0}, describe,
                    cuts_fn=lambda u, d: [], grid_fn=bad_grid, probe_fn=lambda u: "")


def test_vision_json_sends_image_url_block_and_reads_openai_choices(monkeypatch):
    from ingest import cfapi
    sent = {}
    def fake_call(path, body):
        sent["path"], sent["body"] = path, json.loads(body)
        return {"choices": [{"message": {"content": '{"text": "x", "same_as_previous": false}'}}]}
    monkeypatch.setattr(cfapi, "_call", fake_call)
    out = cfapi.vision_json("sys", "txt", b"\xff\xd8jpg", {"type": "object"})
    assert out == '{"text": "x", "same_as_previous": false}'
    assert sent["path"] == f"/ai/run/{cfapi.VISION_MODEL}"
    user = sent["body"]["messages"][1]["content"]
    assert user[0] == {"type": "text", "text": "txt"}
    assert user[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    # older Workers AI shape still accepted
    monkeypatch.setattr(cfapi, "_call", lambda path, body: {"response": {"text": "y"}})
    assert cfapi.vision_json("s", "t", b"j", {}) == {"text": "y"}


def test_moments_for_retries_a_flaky_grid_once():
    describe, _ = _fakes(["Pan right."])
    tries = []
    def flaky(u, t, o):
        tries.append(1)
        if len(tries) == 1:
            raise RuntimeError("transient read error")
        open(o, "wb").write(b"j")
    moments, n = moments_for({"id": "V", "cdn_url": "u", "duration": 10.0}, describe,
                             cuts_fn=lambda u, d: [], grid_fn=flaky, probe_fn=lambda u: "")
    assert len(tries) == 2 and moments == [{"start": 0.0, "end": 10.0, "text": "Pan right."}]


def test_merge_canonicalises_and_folds_no_change_sentences():
    from ingest.moments import no_change
    for t in ["The scene is unchanged.", "No changes noted between frames, the scene remains consistent with a cloudy sky.",
              "The scene remains static, with no changes in the camera or sensor behavior, and no new objects or light sources appearing in the frames.",
              "Between frames, no change is observed in the scene or sensor behavior.", "The scene shows clouds and sky. No changes are observed between frames."]:
        assert no_change(t), t
    for t in ["A small light source appears at the center of the crosshair, moving slightly right and up.",
              "The top-left frame is a uniform gray screen, while the other three frames depict a cloudy landscape. No objects or changes are observed.",
              "The sensor zooms out and no change in the light source is seen."]:
        assert not no_change(t), t
    segs = [(0.0, 5.0), (5.0, 9.0), (9.0, 20.0)]
    res = [{"text": "The scene is unchanged."}, {"text": "No changes are observed between frames."}, {"text": "Zoom in."}]
    assert merge(segs, res) == [{"start": 0.0, "end": 9.0, "text": "No visible change."},
                                {"start": 9.0, "end": 20.0, "text": "Zoom in."}]


def test_no_change_ignores_negated_action_words():
    from ingest.moments import no_change
    assert no_change("The scene remains static, with no changes in the camera or sensor behavior, "
                     "and no new objects or light sources appear in the frames.")
    assert no_change("The scene shows clouds and ground features, with no apparent changes in camera or sensor "
                     "behavior, or new objects or light sources appearing in the frames.")
    assert not no_change("No changes in the overlay, and a light source moves left.")


# --- final review fixes ---------------------------------------------------

def test_no_change_keeps_sentences_that_report_something():
    from ingest.moments import no_change
    for t in ["No visible change except the light source moves slightly right.",
              "The scene remains the same, but a light source brightens.",
              "A light source remains static to the right of the crosshair.",
              "No significant changes; a dark object rises toward the top.",
              "The object is unchanged in position as a second light source becomes visible."]:
        assert not no_change(t), t


def test_describe_skips_on_any_transport_error_after_retries(monkeypatch):
    import http.client
    from ingest import cfapi, moments as M
    monkeypatch.setattr(M.time, "sleep", lambda s: None)
    errs = [ConnectionResetError("reset"), http.client.IncompleteRead(b"x"), ValueError("bad json")]
    def boom(*a, **k):
        raise errs.pop(0) if errs else ConnectionResetError("again")
    monkeypatch.setattr(cfapi, "vision_json", boom)
    with pytest.raises(Skip):
        M.describe(b"j", 0.0, 1.0)
    seq = [ConnectionResetError("reset")]
    def flaky(*a, **k):
        if seq:
            raise seq.pop()
        return '{"text": "Pan right."}'
    monkeypatch.setattr(cfapi, "vision_json", flaky)
    assert M.describe(b"j", 0.0, 1.0) == {"text": "Pan right."}


def test_failed_probe_skips_instead_of_writing_empty():
    describe, _ = _fakes([])
    for probed in ("", "N/A", "nan", "0"):
        with pytest.raises(Skip):
            moments_for({"id": "V", "cdn_url": "u", "duration": None}, describe,
                        cuts_fn=lambda u, d: [], grid_fn=None, probe_fn=lambda u, p=probed: p)


def test_plan_segments_caps_dense_scene_cuts():
    cuts = [i * 3.1 for i in range(1, 329)]
    segs = plan_segments(1020.0, cuts)
    assert len(segs) <= 15
    assert segs[0][0] == 0.0 and segs[-1][1] == 1020.0
    assert all(a[1] == b[0] for a, b in zip(segs, segs[1:]))   # contiguous


def test_daily_selection_is_shuffled_so_stuck_videos_cannot_block_the_queue():
    from ingest.moments import SELECT
    assert "ORDER BY random()" in SELECT


def test_main_survives_a_d1_write_failure(monkeypatch, capsys):
    import subprocess
    from ingest import d1, moments as M
    monkeypatch.setattr(d1, "_d1_json", lambda sql: [{"id": "A", "cdn_url": "u", "duration": 5.0},
                                                    {"id": "B", "cdn_url": "u", "duration": 5.0}])
    monkeypatch.setattr(M, "moments_for", lambda row: ([{"start": 0.0, "end": 5.0, "text": "Pan."}], 1))
    def execute(sql):
        if "'A'" in sql:
            raise subprocess.CalledProcessError(1, "wrangler")
    monkeypatch.setattr(d1, "execute", execute)
    M.main([])
    out = capsys.readouterr().out
    assert "moments: done=1 skipped=1" in out


def test_scene_cut_timeout_skips_the_video(monkeypatch):
    import subprocess
    from ingest import moments as M
    def slow(*a, **k):
        assert k.get("timeout"), "ffmpeg must run with a timeout"
        raise subprocess.TimeoutExpired(a[0], k["timeout"])
    monkeypatch.setattr(M.subprocess, "run", slow)
    with pytest.raises(Skip):
        M.scene_cuts("u", 60.0)
    assert M._probe_duration("u") == ""


def test_parse_model_output_accepts_uppercase_fence():
    assert parse_model_output('```JSON\n{"text": "Pan right."}\n```') == {"text": "Pan right."}


def test_plan_only_prints_segments_without_frames_or_model_calls(monkeypatch, capsys):
    from ingest import d1, moments as M
    monkeypatch.setattr(d1, "_d1_json", lambda sql: [{"id": "A", "cdn_url": "u", "duration": 50.0}])
    monkeypatch.setattr(M, "scene_cuts", lambda url, dur: [20.0])
    def no(*a, **k):
        raise AssertionError("plan-only must not build frames or call the model")
    monkeypatch.setattr(M, "grid_jpeg", no)
    monkeypatch.setattr(M, "describe", no)
    monkeypatch.setattr(d1, "execute", no)
    M.main(["--plan-only"])
    out = capsys.readouterr().out
    assert "A: 3 segments" in out and "plan-only moments: done=0 skipped=0 empty=0 calls=0" in out


def test_tidy_trims_long_answers_to_leading_sentences():
    from ingest.moments import tidy
    long = ("The scene is a body of water. A black rectangular redaction appears in the bottom-left frame. "
            "A crosshair is visible in the top frames, and a black cross appears in the bottom frames. "
            "The crosshair and black cross move with the camera. The camera pans right and tilts down. "
            "Small white objects are visible on the water's surface. One moves from left to right, exiting the frame.")
    out = tidy(long)
    assert out.startswith("The scene is a body of water.") and out.endswith(".")
    assert len(out.split()) <= 40 and problem(out) is None
    assert tidy("Pan right.") == "Pan right."
    one_huge = "word " * 70 + "end."
    assert problem(tidy(one_huge)) == "too long"   # a single run-on sentence can't be trimmed


def test_moments_for_accepts_a_long_answer_after_trimming():
    long = " ".join(["A light source moves right."] * 15)   # 75 words
    describe, calls = _fakes([long])
    moments, n = moments_for({"id": "V", "cdn_url": "u", "duration": 10.0}, describe,
                             cuts_fn=lambda u, d: [], grid_fn=lambda u, t, o: open(o, "wb").write(b"j"), probe_fn=lambda u: "")
    assert n == 1 and len(moments) == 1 and len(moments[0]["text"].split()) <= 40
