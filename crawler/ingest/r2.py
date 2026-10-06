import os, posixpath, subprocess
from . import fetch

def put(key: str, path: str, content_type: str) -> None:
    subprocess.run(
        ["wrangler", "r2", "object", "put", f"realufo/{key}",
         "--file", path, "--content-type", content_type,
         # 30d, not immutable: thumbs.py can re-render a thumb under the same key.
         "--cache-control", "public, max-age=2592000", "--remote"],
        check=True)

def get(key: str, path: str) -> None:
    """Authoritative R2 read. Never fetch text/<id>.json over HTTPS: the
    assets.realufo.org edge cache (1-month Cache Rule) can serve a stale copy
    after a re-OCR rewrite, and ingesting that silently writes old text back
    into D1 (hit 2026-10-06 on FBI-UAP-D002)."""
    subprocess.run(
        ["wrangler", "r2", "object", "get", f"realufo/{key}",
         "--file", path, "--remote"],
        capture_output=True, text=True, check=True)

def mirror(c, workdir: str) -> bool:
    if fetch.head_ok(c.cdn_url):
        return True
    origin = getattr(c, "_origin", "") or c.cdn_url
    tmp = os.path.join(workdir, posixpath.basename(c.r2_key))
    try:
        fetch.download(origin, tmp)
        put(c.r2_key, tmp, c.mime)
    except Exception:
        return False
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return fetch.head_ok(c.cdn_url)
