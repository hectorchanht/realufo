import urllib.parse, urllib.request

def download(url: str, dest: str) -> int:
    from curl_cffi import requests
    r = requests.get(url, impersonate="chrome", timeout=60)
    r.raise_for_status()
    with open(dest, "wb") as f:
        f.write(r.content)
    return len(r.content)

def head_ok(url: str) -> bool:
    try:
        return urllib.request.urlopen(
            # R2 keys can contain raw spaces; urllib rejects them, so escape only
            # illegal chars (existing %XX escapes are kept)
            urllib.request.Request(urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=%~"),
                                   method="HEAD"), timeout=20).status == 200
    except Exception:
        return False
