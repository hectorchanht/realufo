import json, pytest
from ingest import cfapi

class FakeResp:
    def __init__(self, body): self.body = json.dumps(body).encode()
    def read(self): return self.body
    def __enter__(self): return self
    def __exit__(self, *a): return False

@pytest.fixture
def calls(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acct")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "tok")
    seen = []
    def fake_urlopen(req, timeout=None):
        seen.append(req)
        if "/ai/run/" in req.full_url:
            n = len(json.loads(req.data)["text"])
            return FakeResp({"success": True, "result": {"data": [[float(len(seen))]] * n}})
        return FakeResp({"success": True, "result": {}})
    monkeypatch.setattr(cfapi.urllib.request, "urlopen", fake_urlopen)
    return seen

def test_embed_batches_of_100_in_order(calls):
    vecs = cfapi.embed([f"t{i}" for i in range(250)])
    assert [len(json.loads(c.data)["text"]) for c in calls] == [100, 100, 50]
    assert len(vecs) == 250 and vecs[0] == [1.0] and vecs[249] == [3.0]
    assert calls[0].full_url == "https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/baai/bge-m3"
    assert calls[0].get_header("Authorization") == "Bearer tok"

def test_embed_caps_each_request_by_characters(calls):
    # bge-m3 rejects requests over 60k tokens; garbled OCR runs ~0.6-2 tokens/char,
    # so 100 x 1,500-char chunks (91k tokens) failed in prod with HTTP 400.
    vecs = cfapi.embed(["x" * 1500] * 250)
    sizes = [len(json.loads(c.data)["text"]) for c in calls]
    assert all(n * 1500 <= cfapi.EMBED_MAX_CHARS for n in sizes)
    assert sum(sizes) == 250 and len(vecs) == 250

def test_upsert_sends_ndjson(calls):
    cfapi.upsert([{"id": "a-0", "values": [0.1], "metadata": {"record_id": "A", "page": 0, "text": "x"}}] * 3)
    (req,) = calls
    assert req.full_url.endswith("/vectorize/v2/indexes/realufo-chunks/upsert")
    assert req.get_header("Content-type") == "application/x-ndjson"
    lines = req.data.decode().split("\n")
    assert len(lines) == 3 and json.loads(lines[0])["id"] == "a-0"

def test_delete_batches_ids(calls):
    cfapi.delete([f"id-{i}" for i in range(1500)])
    # Vectorize delete_by_ids: "max id count is 100" (code 40007, seen in prod)
    assert [len(json.loads(c.data)["ids"]) for c in calls] == [100] * 15
    assert calls[0].full_url.endswith("/vectorize/v2/indexes/realufo-chunks/delete_by_ids")

def test_api_failure_raises(monkeypatch, calls):
    monkeypatch.setattr(cfapi.urllib.request, "urlopen",
                        lambda req, timeout=None: FakeResp({"success": False, "errors": [{"message": "nope"}]}))
    with pytest.raises(RuntimeError, match="nope"):
        cfapi.embed(["x"])

def test_respond_calls_gpt_oss_with_instructions_and_returns_output_text(monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acct")
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "tok")
    seen = []
    def fake_urlopen(req, timeout=None):
        seen.append(req)
        return FakeResp({"success": True, "result": {"output": [
            {"type": "reasoning", "content": [{"type": "reasoning_text", "text": "thinking"}]},
            {"type": "message", "content": [{"type": "output_text", "text": '{"lede": "x"}'}]}]}})
    monkeypatch.setattr(cfapi.urllib.request, "urlopen", fake_urlopen)
    assert cfapi.respond("be snarky", "files...") == '{"lede": "x"}'
    (req,) = seen
    assert req.full_url.endswith("/ai/run/@cf/openai/gpt-oss-120b")
    body = json.loads(req.data)
    assert body["instructions"] == "be snarky" and body["input"] == "files..." and body["reasoning"] == {"effort": "low"}
