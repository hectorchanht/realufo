#!/usr/bin/env python3
"""E2E podcast audio check: every episode served by realufo.org must be a
fully downloadable, ffprobe-valid audio file.

Usage: python3 scripts/check-podcast-audio.py [--origin https://realufo.org]
Exit 0 when all episodes pass, 1 otherwise.
"""
import json
import subprocess
import sys
import tempfile
import urllib.request

ORIGIN = sys.argv[sys.argv.index("--origin") + 1] if "--origin" in sys.argv else "https://realufo.org"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RealUFO-audio-check/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "RealUFO-audio-check/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration,format_name:stream=codec_type", "-of", "json", path],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        return None
    return json.loads(out.stdout)


def main():
    data = get_json(f"{ORIGIN}/api/podcast/episodes")
    episodes = data.get("episodes", [])
    if not episodes:
        print("WARN: no episodes returned by /api/podcast/episodes")
        return 0
    failed = 0
    for ep in episodes:
        title = ep.get("title", "?")
        url = ep["audioUrl"]
        if url.startswith("/"):
            url = ORIGIN + url
        try:
            status, ctype, body = download(url)
            ok = status == 200 and body[:2] != b"<!" and len(body) > 100_000
            detail = f"http={status} type={ctype} bytes={len(body)}"
            if ok:
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=True) as f:
                    f.write(body)
                    f.flush()
                    info = probe(f.name)
                streams = (info or {}).get("streams", [])
                has_audio = any(s.get("codec_type") == "audio" for s in streams)
                dur = float(((info or {}).get("format", {}) or {}).get("duration") or 0)
                ok = bool(has_audio and dur > 30)
                detail += f" audio={has_audio} duration={dur:.0f}s"
            print(("PASS" if ok else "FAIL"), "-", title, "-", detail, flush=True)
            if not ok:
                failed += 1
        except Exception as e:  # noqa: BLE001 - report and continue
            print("FAIL", "-", title, "-", f"error: {e}", flush=True)
            failed += 1
    print(f"{len(episodes) - failed}/{len(episodes)} episodes playable")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
