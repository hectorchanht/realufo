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

def test_upsert_sends_ndjson(calls):
    cfapi.upsert([{"id": "a-0", "values": [0.1], "metadata": {"record_id": "A", "page": 0, "text": "x"}}] * 3)
    (req,) = calls
    assert req.full_url.endswith("/vectorize/v2/indexes/realufo-chunks/upsert")
    assert req.get_header("Content-type") == "application/x-ndjson"
    lines = req.data.decode().split("\n")
    assert len(lines) == 3 and json.loads(lines[0])["id"] == "a-0"

def test_delete_batches_ids(calls):
    cfapi.delete([f"id-{i}" for i in range(1500)])
    assert [len(json.loads(c.data)["ids"]) for c in calls] == [1000, 500]
    assert calls[0].full_url.endswith("/vectorize/v2/indexes/realufo-chunks/delete_by_ids")

def test_api_failure_raises(monkeypatch, calls):
    monkeypatch.setattr(cfapi.urllib.request, "urlopen",
                        lambda req, timeout=None: FakeResp({"success": False, "errors": [{"message": "nope"}]}))
    with pytest.raises(RuntimeError, match="nope"):
        cfapi.embed(["x"])
