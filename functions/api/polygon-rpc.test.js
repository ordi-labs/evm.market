import test from "node:test";
import assert from "node:assert/strict";
import { onRequestPost } from "./polygon-rpc.js";

function request(body, origin = "https://market.test") {
  return new Request("https://market.test/api/polygon-rpc", {
    method: "POST",
    headers: {"content-type":"application/json", ...(origin ? {origin} : {})},
    body: JSON.stringify(body)
  });
}
const rpc = (method, params = []) => ({jsonrpc:"2.0",id:7,method,params});

test("rejects cross-origin requests and transaction submission methods", async () => {
  let response = await onRequestPost({request:request(rpc("eth_call"),"https://attacker.test"),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,403);
  response = await onRequestPost({request:request(rpc("eth_sendRawTransaction",["0x"+"ab".repeat(80)])),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);
  assert.match((await response.json()).error,/not allowed/);
});

test("confirms Polygon mainnet before forwarding a read call", async () => {
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),body:JSON.parse(init.body)});const method=JSON.parse(init.body).method;return new Response(JSON.stringify({jsonrpc:"2.0",id:7,result:method==="eth_chainId"?"0x89":"0x1234"}),{status:200})};
  try{
    const response=await onRequestPost({request:request(rpc("eth_call",[{to:"0x0000000000000000000000000000000000000001",data:"0x12345678"},"latest"])),env:{ALCHEMY_API_KEY:"test-key"}});
    assert.equal(response.status,200);
    assert.deepEqual(calls.map(x=>x.body.method),["eth_chainId","eth_call"]);
    assert.match(calls[0].url,/polygon-mainnet\.g\.alchemy\.com\/v2\/test-key$/);
    assert.equal((await response.json()).result,"0x1234");
  }finally{globalThis.fetch=originalFetch}
});

test("fails closed when the configured Polygon RPC is actually another chain", async () => {
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body).method);return new Response(JSON.stringify({jsonrpc:"2.0",id:7,result:"0x1"}),{status:200})};
  try{
    const response=await onRequestPost({request:request(rpc("eth_getTransactionReceipt",["0x"+"11".repeat(32)])),env:{POLYGON_RPC:"https://polygon-rpc.example"}});
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/chain ID 137/);
    assert.deepEqual(calls,["eth_chainId"]);
  }finally{globalThis.fetch=originalFetch}
});
