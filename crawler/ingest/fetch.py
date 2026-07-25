import urllib.request

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
            urllib.request.Request(url, method="HEAD"), timeout=20).status == 200
    except Exception:
        return False
