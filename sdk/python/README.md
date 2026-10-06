# realufo (Python)

Python client for the [RealUFO Public API](https://realufo.org/developers) — the declassified UAP archive. Read-only, keyless. Zero dependencies (stdlib only).

```bash
pip install realufo
```

```python
from realufo import RealUFO

api = RealUFO()  # or RealUFO("https://realufo.org/api/v1")

page = api.records(q="tic tac", per_page=5)
print(page["meta"]["total"], page["data"][0]["title"])

doc = api.record("DOW-UAP-PR057a")
pages = api.text("DOW-UAP-PR057a")  # OCR full text
releases = api.releases()
sub = api.webhook("https://example.com/hook")  # secret shown once
```

## API

`records(**params)` · `record(id)` · `text(id)` · `archives()` · `releases()` · `cases()` · `case(slug)` · `shorts(**params)` · `hubs()` · `hub(kind, slug)` · `webhook(url, events=...)` · `delete_webhook(id, secret)` · `RealUFO.verify_webhook(secret, body, signature)`

Errors raise `RealUFOError` with `.status`.

## Verifying webhooks

```python
ok = RealUFO.verify_webhook(secret, request_body_bytes, request.headers["X-RealUFO-Signature"])
```
