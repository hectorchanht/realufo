from ingest.clips import window, ffmpeg_args, todo, key, vkey, clean_title, vertical_args, title_layout, fit, bars, fills, slate, trim

def test_window_is_30s_from_35pct_kept_inside_the_video():
    assert window(20.0) == (0.0, 30.0)           # short video: whole (-t 30 is a no-op)
    assert window(None) == (0.0, 30.0)           # unknown duration
    assert window(600.0) == (210.0, 30.0)        # 35% in, skips the DoD "Unclassified" slate
    assert window(80.0) == (28.0, 30.0)
    assert window(40.0) == (10.0, 30.0)          # 35% (14 s) + 30 would overrun: end-aligned

def test_ffmpeg_args_are_x_compatible():
    a = ffmpeg_args("https://cdn/v.mp4", 210.0, 60.0, "/tmp/o.mp4", "/tmp/id.txt", "/fonts/D.ttf")
    j = " ".join(a)
    vf = a[a.index("-vf") + 1]
    assert "textfile=/tmp/id.txt" in vf and "text=realufo.org" in vf and "fontfile=/fonts/D.ttf" in vf
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
    a = vertical_args("https://cdn/v.mp4", 210.0, 30.0, "/tmp/o.mp4", ["/tmp/t.txt"], 56, "/fonts/D.ttf")
    fc = a[a.index("-filter_complex") + 1]
    for part in ("scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "boxblur",
                 "scale=1080:1920:force_original_aspect_ratio=decrease", "overlay=(W-w)/2:(H-h)/2", "textfile=/tmp/t.txt", "expansion=none",
                 "fontfile=/fonts/D.ttf", "text=realufo.org"):
        assert part in fc
    assert a.index("-ss") < a.index("-i") and a[a.index("-t") + 1] == "30.00"
    assert "anullsrc" not in " ".join(a) and "0:a:0" in a
    assert a[a.index("-r") + 1] == "30"                        # constant fps: TikTok needs >= 23
    for flag in ("libx264", "yuv420p", "+faststart", "aac"):
        assert flag in a
    assert a[-1] == "/tmp/o.mp4"

def test_vertical_args_burns_the_id_above_the_title():
    fc = (a := vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", ["/tmp/t.txt"], 56, "/f.ttf", id_file="/tmp/id.txt"))[a.index("-filter_complex") + 1]
    assert fc.index("textfile=/tmp/id.txt") < fc.index("textfile=/tmp/t.txt")
    assert "textfile=/tmp/id.txt:expansion=none:fontsize=46:" in fc

def test_fit_shrinks_long_ids_to_the_frame():
    assert fit(20, 46) == 46                                   # WARGOV-VID-111688723
    n = len("AARO-DOD_110692805-1920x1080-9000k")
    assert fit(n, 46) < 46 and n * fit(n, 46) * 0.72 <= 1000

def test_vertical_args_adds_silent_audio_when_source_has_none():
    a = vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", ["/tmp/t.txt"], 56, "/f.ttf", audio=False)
    j = " ".join(a)
    assert "anullsrc=channel_layout=stereo:sample_rate=44100" in j
    assert a[a.index("-map", a.index("[v]")) + 1] == "1:a"

def test_title_layout_wraps_and_sizes_to_fit_the_frame():
    t = clean_title("LLE-UAP-PR002", "LLE-UAP-PR002, Unresolved UAP Report, Colorado, October 2023")
    lines, fs = title_layout(t)
    assert lines == ["Unresolved UAP Report,", "Colorado, Octobe…"]
    assert " ".join(lines) == t
    assert max(len(l) for l in lines) * fs * 0.72 <= 1000     # all-caps advance still fits 1080 - margins
    assert title_layout("Go Fast UAP") == (["Go Fast UAP"], 64)   # short: one line, capped size
    assert title_layout("Navy 2021 Flyby video")[0] == ["Navy 2021 Flyby video"]   # ≤24 chars: no split
    lines, fs = title_layout("X" * 40)                         # no space to wrap: shrink instead
    assert lines == ["X" * 40] and 40 * fs * 0.72 <= 1000

def test_vertical_args_draw_one_centred_line_per_title_file():
    a = vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", ["/tmp/1.txt", "/tmp/2.txt"], 50, "/f.ttf")
    fc = a[a.index("-filter_complex") + 1]
    assert "textfile=/tmp/1.txt:expansion=none:fontsize=50:y=340," in fc   # below the app tabs (safe zone)
    assert "textfile=/tmp/2.txt:expansion=none:fontsize=50:y=405," in fc
    assert "text=realufo.org:fontsize=44:y=1420" in fc                   # above the caption/buttons area
    assert fc.count("x=(w-text_w)/2") == 3                    # both title lines + realufo.org

def test_bars_crops_only_centred_one_axis_black_bars():
    assert bars(1920, 1080, 616, 1080, 652, 0) == "crop=616:1080:652:0"    # AARO-956955: portrait in 16:9
    assert bars(1920, 1080, 1920, 800, 0, 140) == "crop=1920:800:0:140"    # letterbox
    assert bars(608, 1080, 608, 726, 0, 354) is None                       # night sky above, ground below
    assert bars(1280, 720, 1280, 720, 0, 0) is None                        # nothing to crop
    assert bars(1920, 1080, 1880, 1080, 20, 0) is None                     # <10%: not worth it
    assert bars(1920, 1080, 400, 300, 760, 390) is None                    # bright dot in the dark: both axes

def test_fills_near_vertical_content_and_fits_the_rest():
    assert fills(616, 1080) and fills(608, 1080) and fills(1080, 1920)
    assert not fills(1920, 1080) and not fills(1080, 1440)                 # 16:9, 3:4: fit inside

def test_vertical_args_crops_bars_then_fills():
    a = vertical_args("u", 0.0, 30.0, "/tmp/o.mp4", ["/tmp/t.txt"], 56, "/f.ttf", crop="crop=616:1080:652:0", fill=True)
    fc = a[a.index("-filter_complex") + 1]
    assert fc.startswith("[0:v]crop=616:1080:652:0,split[a][b];")
    assert "[b]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[fg]" in fc

def test_slate_is_a_mostly_green_frame():
    green, grey = bytes([40, 170, 20]) * 100, bytes([120, 120, 120]) * 100
    assert slate(green) and not slate(grey)
    assert not slate(green[:150] + grey[150:])                             # half green: footage

def test_trim_drops_slates_at_both_ends():
    S, F = True, False
    assert trim([S] * 6 + [F] * 10, fps=2) == (3.5, None)                  # 3 s card + 1 sample margin
    assert trim([S] * 6 + [F] * 10 + [S] * 4, fps=2) == (3.5, 4.0)         # closing card too
    assert trim([F] * 10) == (0.0, None)                                   # wargov: no card
    assert trim([S] * 4) == (0.0, None)                                    # all card: leave it

def test_ffmpeg_args_burn_id_then_title_sized_to_the_width():
    a = ffmpeg_args("u", 0.0, 30.0, "/tmp/o.mp4", "/tmp/id.txt", "/f.ttf", "/tmp/t.txt", 13, 40)
    vf = a[a.index("-vf") + 1]
    assert vf.index("textfile=/tmp/id.txt") < vf.index("textfile=/tmp/t.txt") < vf.index("text=realufo.org")
    assert "textfile=/tmp/t.txt:expansion=none:fontsize='min(28,(w-40)/28.80)':x=20:y=72" in vf
    assert "fontsize='min(32,(w-40)/9.36)'" in vf                          # 13-char id
    b = ffmpeg_args("u", 0.0, 30.0, "/tmp/o.mp4", "/tmp/id.txt", "/f.ttf")    # no title: id + realufo.org only
    assert b[b.index("-vf") + 1].count("drawtext=") == 2
