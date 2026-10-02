from ingest.clips import window, ffmpeg_args, todo, key, vkey, clean_title, vertical_args

def test_window_is_30s_from_35pct_kept_inside_the_video():
    assert window(20.0) == (0.0, 30.0)           # short video: whole (-t 30 is a no-op)
    assert window(None) == (0.0, 30.0)           # unknown duration
    assert window(600.0) == (210.0, 30.0)        # 35% in, skips the DoD "Unclassified" slate
    assert window(80.0) == (28.0, 30.0)
    assert window(40.0) == (10.0, 30.0)          # 35% (14 s) + 30 would overrun: end-aligned

def test_ffmpeg_args_are_x_compatible():
    a = ffmpeg_args("https://cdn/v.mp4", 210.0, 60.0, "/tmp/o.mp4")
    j = " ".join(a)
    assert a[a.index("-ss") + 1] == "210.00" and a[a.index("-t") + 1] == "60.00"
    assert a.index("-ss") < a.index("-i")        # input seek: fast on CDN range requests
    for flag in ("libx264", "yuv420p", "+faststart", "aac", "0:a:0?", "-fpsmax"):
        assert flag in j
    assert a[-1] == "/tmp/o.mp4"

def test_todo_dedupes_skips_existing_and_limits():
    rows = [{"id": "V1", "archive": "wargov", "cdn_url": "u1", "duration": 10},
            {"id": "V1", "archive": "wargov", "cdn_url": "u1b", "duration": 10},
            {"id": "V2", "archive": "aaro", "cdn_url": "u2", "duration": 200},
            {"id": "V3", "archive": "wargov", "cdn_url": "u3", "duration": 5}]
    exists = lambda url: url.endswith("/clips/aaro/V2.mp4")
    got = todo(rows, exists)
    assert [r["id"] for r in got] == ["V1", "V3"] and got[0]["cdn_url"] == "u1"
    assert [r["id"] for r in todo(rows, exists, limit=1)] == ["V1"]
    assert key(got[0]) == "clips/wargov/V1.mp4"
    assert [r["id"] for r in todo(rows, exists, force=True)] == ["V1", "V2", "V3"]   # re-cut existing

def test_vkey_and_todo_keyf():
    row = {"id": "V1", "archive": "wargov", "cdn_url": "u", "duration": 10}
    assert vkey(row) == "clips-v/wargov/V1.mp4"
    exists = lambda url: url.endswith("/clips/wargov/V1.mp4")    # landscape exists, vertical doesn't
    assert [r["id"] for r in todo([row], exists, keyf=vkey)] == ["V1"]
    assert todo([row], exists) == []

def test_clean_title_strips_id_prefix_underscores_and_caps_length():
    assert clean_title("DOW-UAP-PR019", "DOW-UAP-PR019, Gulf of Oman orb") == "Gulf of Oman orb"
    assert clean_title("AARO-IMG-Go_Fast", "Go_Fast_UAP") == "Go Fast UAP"
    assert clean_title("X1", None) == "X1"
    t = clean_title("X1", "a very long title that keeps going well past forty characters")
    assert len(t) == 40 and t.endswith("…")

def test_vertical_args_pad_blur_overlay_and_text():
    a = vertical_args("https://cdn/v.mp4", 210.0, 30.0, "/tmp/o.mp4", "/tmp/t.txt", "/fonts/D.ttf")
    fc = a[a.index("-filter_complex") + 1]
    for part in ("scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "boxblur",
                 "scale=1080:-2", "overlay=(W-w)/2:(H-h)/2", "textfile=/tmp/t.txt", "expansion=none",
                 "fontfile=/fonts/D.ttf", "text=realufo.org"):
        assert part in fc
    assert a.index("-ss") < a.index("-i") and a[a.index("-t") + 1] == "30.00"
    assert "anullsrc" not in " ".join(a) and "0:a:0" in a
    for flag in ("libx264", "yuv420p", "+faststart", "aac"):
        assert flag in a
    assert a[-1] == "/tmp/o.mp4"

def test_vertical_args_adds_silent_audio_when_source_has_none():
    a = vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", "/tmp/t.txt", "/f.ttf", audio=False)
    j = " ".join(a)
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in j
    assert a[a.index("-map", a.index("[v]")) + 1] == "1:a"
