"""Minimal Cloudflare REST client for the Ask indexer (stdlib only).

Token needs Account permissions: Workers AI Read + Edit, Vectorize Edit.
"""
import json, os, urllib.request

API = "https://api.cloudflare.com/client/v4/accounts/{acct}"
EMBED_MODEL = "@cf/baai/bge-m3"
INDEX = "realufo-chunks"
EMBED_BATCH = 100
WRITE_BATCH = 1000

def _call(path: str, body: bytes, ctype: str = "application/json"):
    acct, tok = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
    req = urllib.request.Request(API.format(acct=acct) + path, data=body, method="POST",
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read())
    if not out.get("success"):
        raise RuntimeError(f"{path}: {out.get('errors')}")
    return out["result"]

def embed(texts: list[str]) -> list[list[float]]:
    vecs: list[list[float]] = []
    for i in range(0, len(texts), EMBED_BATCH):
        res = _call(f"/ai/run/{EMBED_MODEL}", json.dumps({"text": texts[i:i + EMBED_BATCH]}).encode())
        vecs += res["data"]
    return vecs

def upsert(vectors: list[dict]) -> None:
    for i in range(0, len(vectors), WRITE_BATCH):
        nd = "\n".join(json.dumps(v) for v in vectors[i:i + WRITE_BATCH]).encode()
        _call(f"/vectorize/v2/indexes/{INDEX}/upsert", nd, "application/x-ndjson")

def delete(ids: list[str]) -> None:
    for i in range(0, len(ids), WRITE_BATCH):
        _call(f"/vectorize/v2/indexes/{INDEX}/delete_by_ids", json.dumps({"ids": ids[i:i + WRITE_BATCH]}).encode())
