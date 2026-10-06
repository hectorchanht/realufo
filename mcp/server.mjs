#!/usr/bin/env node
// RealUFO MCP server — exposes the RealUFO Public API (realufo.org) as
// Model Context Protocol tools over stdio. Zero dependencies: plain Node 18+,
// JSON-RPC 2.0 line-delimited on stdin/stdout.
//
// Usage with Claude Desktop (~/.claude.json or claude_desktop_config.json):
//   { "mcpServers": { "realufo": {
//       "command": "node",
//       "args": ["/path/to/realufo/mcp/server.mjs"],
//       "env": { "REALUFO_BASE_URL": "https://realufo.org" }
//   } } }
//
// Or via npx once published: npx realufo-mcp
const BASE = (process.env.REALUFO_BASE_URL || "https://realufo.org").replace(/\/$/, "");
const MAX_CHARS = 12000; // trim tool output so a big OCR dump can't flood context

const TOOLS = [
  {
    name: "search_records",
    description:
      "Search the RealUFO declassified UAP archive. Full-text search over titles, summaries and OCR page text, plus filters. Returns record cards (id, title, agency, dates, thumbnail).",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Full-text query, e.g. 'tic tac', 'roswell'" },
        archive: { type: "string", description: "e.g. wargov, aaro, nara, nasa" },
        type: { type: "string", enum: ["pdf", "video", "image", "shorts", "audio"] },
        agency: { type: "string", description: "e.g. DoD, AARO, FBI, CIA, NASA" },
        location: { type: "string" },
        year: { type: "string", description: "e.g. 1947" },
        decade: { type: "string", description: "e.g. 1940" },
        page: { type: "integer", default: 1 },
        per_page: { type: "integer", default: 10, maximum: 100 },
      },
    },
    path: (a) => `/api/v1/records${qs(a, ["q", "archive", "type", "agency", "location", "year", "decade", "page", "per_page"])}`,
  },
  {
    name: "get_record",
    description:
      "Full detail for one record: assets, release info, series neighbours, related records, AI summary, TL;DR, topics and hubs.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Record id, e.g. DOW-UAP-PR057a" } },
      required: ["id"],
    },
    path: (a) => `/api/v1/records/${encodeURIComponent(a.id)}`,
  },
  {
    name: "get_record_text",
    description: "OCR full text pages of a record (for PDFs: page-by-page text).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Record id" } },
      required: ["id"],
    },
    path: (a) => `/api/v1/records/${encodeURIComponent(a.id)}/text`,
  },
  {
    name: "list_releases",
    description: "war.gov UAP release list with file counts and dates.",
    inputSchema: { type: "object", properties: {} },
    path: () => `/api/v1/releases`,
  },
  {
    name: "list_cases",
    description: "Case stories (Roswell, Tic Tac, …): slug + title list.",
    inputSchema: { type: "object", properties: {} },
    path: () => `/api/v1/cases`,
  },
  {
    name: "get_case",
    description: "One case story with its resolved source records.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string", description: "Case slug from list_cases" } },
      required: ["slug"],
    },
    path: (a) => `/api/v1/cases/${encodeURIComponent(a.slug)}`,
  },
  {
    name: "list_hubs",
    description: "Curated hubs: agencies, locations, releases, decades, topics with file counts.",
    inputSchema: { type: "object", properties: {} },
    path: () => `/api/v1/hubs`,
  },
];

function qs(a, keys) {
  const p = new URLSearchParams();
  for (const k of keys) if (a[k] !== undefined && a[k] !== null && a[k] !== "") p.set(k, String(a[k]));
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function callTool(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `unknown tool: ${name}` }] };
  const res = await fetch(BASE + tool.path(args || {}));
  let text = await res.text();
  if (!res.ok) return { isError: true, content: [{ type: "text", text: `HTTP ${res.status}: ${text.slice(0, 500)}` }] };
  // Re-serialize compact JSON when possible so it reads cleanly.
  try { text = JSON.stringify(JSON.parse(text)); } catch { /* keep raw */ }
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + `… (truncated at ${MAX_CHARS} chars)`;
  return { content: [{ type: "text", text }] };
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

async function handle(msg) {
  if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return;
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      respond(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "realufo", version: "1.0.0" },
      });
    } else if (method === "tools/list") {
      respond(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });
    } else if (method === "tools/call") {
      respond(id, await callTool(params?.name, params?.arguments));
    } else if (method === "ping") {
      respond(id, {});
    } else if (id !== undefined) {
      respondError(id, -32601, `method not found: ${method}`);
    }
    // notifications (no id): no response
  } catch (e) {
    if (id !== undefined) respondError(id, -32603, e instanceof Error ? e.message : String(e));
  }
}

// Line-delimited JSON-RPC on stdin.
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line));
    } catch {
      /* ignore malformed line */
    }
  }
});
