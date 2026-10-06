# realufo-mcp

MCP (Model Context Protocol) server for the [RealUFO Public API](https://realufo.org/developers) — lets Claude Desktop, Claude Code and other MCP clients search the declassified UAP archive, pull record detail and OCR text, list releases and case stories.

Zero dependencies. Plain Node 18+.

`REALUFO_BASE_URL` is optional (defaults to `https://realufo.org`); point it at a local worker when developing.

## Use

```bash
npx -y realufo-mcp
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "realufo": {
      "command": "npx",
      "args": ["-y", "realufo-mcp"],
      "env": { "REALUFO_BASE_URL": "https://realufo.org" }
    }
  }
}
```

Or run from a local checkout:

```json
{
  "mcpServers": {
    "realufo": {
      "command": "node",
      "args": ["/path/to/realufo/mcp/server.mjs"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `search_records` | Full-text search + filters (archive, type, agency, location, year, decade) |
| `get_record` | Full detail: assets, release, series, related, AI summary, TL;DR, topics |
| `get_record_text` | OCR full text pages of a record |
| `list_releases` | war.gov release list with file counts |
| `list_cases` / `get_case` | Case stories and one story with resolved sources |
| `list_hubs` | Curated hubs: agency, location, release, decade, topic |

Output is compact JSON, truncated at 12k chars per call so a big OCR dump can't flood context.

## Test

```bash
node smoke-test.mjs   # loopback stub: initialize → tools/list → tools/call
```

Or drive it manually over stdio:
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_records","arguments":{"q":"tic tac","per_page":2}}}' \
  | node server.mjs
```
