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
test("rejects transaction submission methods", async () => {
  const response = await onRequestPost({request:request(rpc("eth_sendRawTransaction",["0x1234"])),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/must stay in the connected wallet/);
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
