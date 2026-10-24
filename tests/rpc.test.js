import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "../functions/api/rpc.js";

function request(body, origin = "https://market.test") {
  return new Request("https://market.test/api/rpc", {
    method: "POST",
    headers: {"content-type":"application/json", ...(origin ? {origin} : {})},
    body: JSON.stringify(body)
  });
}
const rpc = (method, params = []) => ({jsonrpc:"2.0",id:1,method,params});

test("rejects invalid JSON-RPC envelopes", async () => {
  const response = await onRequestPost({request:request({method:"eth_chainId",params:[],id:1}),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);
});
test("rejects cross-origin requests", async () => {
  const response = await onRequestPost({request:request(rpc("eth_chainId"),"https://attacker.test"),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,403);
});
test("rejects malformed signed transactions", async () => {
  const response = await onRequestPost({request:request(rpc("eth_sendRawTransaction",["0x1234"])),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/valid signed raw transaction/);
});
test("broadcasts signed transactions only after confirming Base mainnet", async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(init.body); calls.push(body.method); return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:body.method === "eth_chainId" ? "0x2105" : "0x" + "a".repeat(64)}),{status:200}); };
  try {
    const response = await onRequestPost({request:request(rpc("eth_sendRawTransaction",["0x" + "ab".repeat(100)])),env:{ETHEREUM_API:"https://base-rpc.example/rpc"}});
    assert.equal(response.status,200); assert.deepEqual(calls,["eth_chainId","eth_sendRawTransaction"]);
    assert.equal((await response.json()).result,"0x" + "a".repeat(64));
  } finally { globalThis.fetch = originalFetch; }
});
test("blocks broadcasting when ETHEREUM_API is not Base mainnet", async () => {
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => new Response(JSON.stringify({result:"0x1"}),{status:200});
  try {
    const response = await onRequestPost({request:request(rpc("eth_sendRawTransaction",["0x" + "ab".repeat(100)])),env:{ETHEREUM_API:"https://rpc.example"}});
    assert.equal(response.status,409); assert.match((await response.json()).error,/not responding as Base mainnet/);
  } finally { globalThis.fetch = originalFetch; }
});
test("fails closed if Alchemy is not configured", async () => {
  const response = await onRequestPost({request:request(rpc("eth_chainId")),env:{}});
  assert.equal(response.status,503);
});
test("proxies allowlisted read-only calls without exposing the key", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  let sentBody;
  globalThis.fetch = async (url, init) => {
    calledUrl = String(url);
    sentBody = JSON.parse(init.body);
    return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:"0x2105"}),{status:200});
  };
  try {
    const response = await onRequestPost({request:request(rpc("eth_chainId")),env:{ETHEREUM_API:"test-secret"}});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{jsonrpc:"2.0",id:1,result:"0x2105"});
    assert.match(calledUrl,/base-mainnet\.g\.alchemy\.com\/v2\/test-secret$/);
    assert.equal(sentBody.method,"eth_chainId");
  } finally { globalThis.fetch = originalFetch; }
});
test("validates target address before proxying eth_call", async () => {
  const response = await onRequestPost({request:request(rpc("eth_call",[{to:"not-an-address",data:"0x1234"},"latest"])),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/valid target address/);
});
