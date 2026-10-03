"""Minimal Cloudflare REST client for the Ask indexer (stdlib only).

Token needs Account permissions: Workers AI Read + Edit, Vectorize Edit.
"""
import json, os, urllib.request

API = "https://api.cloudflare.com/client/v4/accounts/{acct}"
EMBED_MODEL = "@cf/baai/bge-m3"
INDEX = "realufo-chunks"
EMBED_BATCH = 100
# bge-m3 caps a request at 60k tokens; garbled OCR can run ~2 tokens/char.
EMBED_MAX_CHARS = 30_000
WRITE_BATCH = 1000   # upsert
DELETE_BATCH = 100   # delete_by_ids: API max is 100 ids

def _call(path: str, body: bytes, ctype: str = "application/json"):
    acct, tok = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
    req = urllib.request.Request(API.format(acct=acct) + path, data=body, method="POST",
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read())
    if not out.get("success"):
        raise RuntimeError(f"{path}: {out.get('errors')}")
    return out["result"]

def _batches(texts: list[str]):
    batch, size = [], 0
    for t in texts:
        if batch and (len(batch) == EMBED_BATCH or size + len(t) > EMBED_MAX_CHARS):
            yield batch
            batch, size = [], 0
        batch.append(t)
        size += len(t)
    if batch:
        yield batch

def embed(texts: list[str]) -> list[list[float]]:
    vecs: list[list[float]] = []
    for batch in _batches(texts):
        vecs += _call(f"/ai/run/{EMBED_MODEL}", json.dumps({"text": batch}).encode())["data"]
    return vecs

def upsert(vectors: list[dict]) -> None:
    for i in range(0, len(vectors), WRITE_BATCH):
        nd = "\n".join(json.dumps(v) for v in vectors[i:i + WRITE_BATCH]).encode()
        _call(f"/vectorize/v2/indexes/{INDEX}/upsert", nd, "application/x-ndjson")

def delete(ids: list[str]) -> None:
    for i in range(0, len(ids), DELETE_BATCH):
        _call(f"/vectorize/v2/indexes/{INDEX}/delete_by_ids", json.dumps({"ids": ids[i:i + DELETE_BATCH]}).encode())

VISION_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"

def vision_json(system: str, text: str, jpeg: bytes, schema: dict, max_tokens: int = 200):
    """One image + text -> the model's reply (JSON string or dict).

    Llama 4 Scout reads images only from an OpenAI-style `image_url` content
    block (a top-level `image` field is silently ignored), and answers in
    OpenAI chat shape: result.choices[0].message.content.
    """
    import base64
    url = "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
    body = {"messages": [{"role": "system", "content": system},
                         {"role": "user", "content": [{"type": "text", "text": text},
                                                      {"type": "image_url", "image_url": {"url": url}}]}],
            "guided_json": schema, "max_tokens": max_tokens, "temperature": 0.2}
    out = _call(f"/ai/run/{VISION_MODEL}", json.dumps(body).encode())
    choices = out.get("choices") or []
    if choices:
        return (choices[0].get("message") or {}).get("content")
    return out.get("response")

CHAT_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"  # same LLM as Ask (worker/lib/ask.ts)

def chat(system: str, user: str, max_tokens: int = 400, temperature: float = 0.2):
    """System + user text -> the model's reply text (may still hold a <think> block)."""
    body = {"messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "max_tokens": max_tokens, "temperature": temperature, "chat_template_kwargs": {"enable_thinking": False}}
    out = _call(f"/ai/run/{CHAT_MODEL}", json.dumps(body).encode())
    msg = ((out.get("choices") or [{}])[0].get("message") or {})
    # Qwen3 on Workers AI sometimes answers in reasoning_content with content null.
    return out.get("response") or msg.get("content") or msg.get("reasoning_content")

RESPOND_MODEL = "@cf/openai/gpt-oss-120b"  # funnier + more exact than qwen3 for hub highlights

def respond(instructions: str, text: str, effort: str = "low") -> str | None:
    """Responses-API style call (gpt-oss): instructions + input -> the final message text."""
    body = {"instructions": instructions, "input": text, "reasoning": {"effort": effort}}
    out = _call(f"/ai/run/{RESPOND_MODEL}", json.dumps(body).encode())
    for item in out.get("output") or []:
        if item.get("type") == "message":
            for c in item.get("content") or []:
                if c.get("type") == "output_text":
                    return c.get("text")
    return None
