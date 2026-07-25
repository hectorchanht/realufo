import os, posixpath, subprocess
from . import fetch

def put(key: str, path: str, content_type: str) -> None:
    subprocess.run(
        ["wrangler", "r2", "object", "put", f"realufo/{key}",
         "--file", path, "--content-type", content_type, "--remote"],
        check=True)

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
