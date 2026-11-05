# realufo (JS)

JavaScript/TypeScript client for the [RealUFO Public API](https://realufo.org/developers) — the declassified UAP archive. Read-only, keyless, CORS-open. Zero dependencies.

The archive at [realufo.org](https://realufo.org) mirrors the declassified UAP/UFO records from the Pentagon's PURSUE releases, AARO, the CIA, FBI, NASA and the National Archives — full text, case files and a release tracker. New to the subject? Start with [Real UFO: are UFOs real?](https://realufo.org/real-ufo) — what the files actually show — and the [UAP disclosure timeline](https://realufo.org/disclosure).

```bash
npm install realufo
```

```ts
import { RealUFO } from "realufo";

const api = new RealUFO(); // or new RealUFO("https://realufo.org/api/v1")

const { data, meta } = await api.records({ q: "tic tac", per_page: 5 });
console.log(meta.total, data[0].title);

const doc = await api.record("DOW-UAP-PR057a");
const pages = await api.text("DOW-UAP-PR057a"); // OCR full text
const releases = await api.releases();
const sub = await api.webhook("https://example.com/hook"); // secret shown once
```

## API

`records(params)` · `record(id)` · `text(id)` · `archives()` · `releases()` · `cases()` · `case(slug)` · `shorts(params)` · `hubs()` · `hub(kind, slug)` · `webhook(url, events?)` · `deleteWebhook(id, secret)` · `RealUFO.verifyWebhook(secret, body, signature)`

Errors throw `RealUFOError` with `.status`.

## Verifying webhooks (Node)

```ts
import { RealUFO } from "realufo";
// in your handler:
const ok = await RealUFO.verifyWebhook(secret, rawBody, req.headers["x-realufo-signature"]);
```
