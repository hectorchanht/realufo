from ingest.clips import window, ffmpeg_args, todo, key

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
