#!/usr/bin/env node
// Smoke test for server.mjs: spins a stub RealUFO API on loopback, drives the
// MCP server over stdio (initialize → tools/list → tools/call), and asserts
// each step. No network beyond loopback — the live site's bot mitigation
// blocks GitHub Actions runner IPs, so a live smoke test can't run in CI.
import http from "node:http";
import { spawn } from "node:child_process";

const STUB = {
  data: [{ id: "SMOKE-1", title: "Smoke test record" }],
  meta: { total: 1, page: 1, per_page: 1 },
};

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(STUB));
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  const child = spawn(process.execPath, ["server.mjs"], {
    env: { ...process.env, REALUFO_BASE_URL: `http://127.0.0.1:${port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { err += c; });
  child.on("error", (e) => { console.error("spawn failed:", e.message); process.exit(1); });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: 3, method: "tools/call",
    params: { name: "search_records", arguments: { q: "roswell", per_page: 1 } },
  }) + "\n");
  child.stdin.end();

  const timeout = setTimeout(() => { console.error("timed out waiting for server"); child.kill(); process.exit(1); }, 15000);
  child.on("close", (code) => {
    clearTimeout(timeout);
    server.close();
    const lines = out.trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const byId = Object.fromEntries(lines.filter(Boolean).map((m) => [m.id, m]));
    const fails = [];
    if (byId[1]?.result?.serverInfo?.name !== "realufo") fails.push("initialize");
    if (!Array.isArray(byId[2]?.result?.tools) || byId[2].result.tools.length < 7) fails.push("tools/list");
    if (!byId[3]?.result?.content?.[0]?.text?.includes("SMOKE-1")) fails.push("tools/call");
    if (code !== 0 && code !== null) fails.push(`exit code ${code}`);
    if (err) fails.push(`stderr: ${err.slice(0, 200)}`);
    if (fails.length) { console.error("SMOKE FAIL:", fails.join("; ")); process.exit(1); }
    console.log("smoke test OK: initialize + tools/list (7 tools) + tools/call");
  });
});
