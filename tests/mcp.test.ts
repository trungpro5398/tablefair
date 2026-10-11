import assert from "node:assert/strict";
import test from "node:test";
import { POST, GET } from "../src/app/api/mcp/route";

const rpc = async (body: unknown) => {
  const res = await POST(new Request("http://localhost/api/mcp", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: res.status === 202 ? null : await res.json() };
};

test("MCP handshake, tool list and notifications", async () => {
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  assert.equal(init.json.result.protocolVersion, "2025-06-18");
  assert.ok(init.json.result.capabilities.tools);
  const fallback = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(fallback.json.result.protocolVersion, "2025-11-25");
  assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
  const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.deepEqual(list.json.result.tools.map((t: { name: string }) => t.name), ["fair_pick", "start_huddle", "get_huddle"]);
  for (const t of list.json.result.tools) assert.equal(t.inputSchema.type, "object");
  assert.equal((await rpc({ jsonrpc: "2.0", id: 3, method: "nope" })).json.error.code, -32601);
  assert.equal(GET().status, 405);
});

test("MCP tools: start a huddle, check it, and a fair pick offline", async () => {
  const call = (name: string, args: unknown) => rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } });
  const started = (await call("start_huddle", { title: "Dinner", kind: "place", location: "Melbourne" })).json.result.structuredContent;
  assert.match(started.url, /\/h\/[a-z0-9]{8}$/);
  const got = (await call("get_huddle", { huddle_id: started.huddle_id })).json.result.structuredContent;
  assert.equal(got.status, "waiting for people to join");
  assert.equal((await call("get_huddle", { huddle_id: "zzzzzzzz" })).json.result.isError, true);
  assert.equal((await call("fair_pick", { kind: "movie", members: [] })).json.result.isError, true);
  const pick = (await call("fair_pick", { kind: "movie", kids: true, members: [{ name: "A", favourites: ["Spirited Away"] }, { name: "B", favourites: ["John Wick"] }] })).json.result;
  assert.ok(!pick.isError, pick.content?.[0]?.text);
  assert.ok(["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"].includes(pick.structuredContent.pick.content_rating));
  assert.equal((await call("nope", {})).json.error.code, -32602);
});
