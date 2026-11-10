import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "./owned.js";

const CONTRACT = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
function request(params = {}) {
  const url = new URL("https://site.test/api/owned");
  url.searchParams.set("contract", CONTRACT);
  url.searchParams.set("owner", WALLET);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return new Request(url);
}
function ownerResult(address) { return "0x" + "0".repeat(24) + address.slice(2).toLowerCase(); }

test("rejects unsupported contracts and malformed wallet addresses", async () => {
  const unsupported = await onRequestGet({request: new Request("https://site.test/api/owned?contract=0x0000000000000000000000000000000000000001&owner=" + WALLET), env: {}});
  assert.equal(unsupported.status, 400);
  const malformed = await onRequestGet({request: request({owner: "not-a-wallet"}), env: {}});
  assert.equal(malformed.status, 400);
});

test("accepts all eight configured collection contracts", async () => {
  for (const contract of [CONTRACT, "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a", "0x7325654c657520e30c56a04225a3d9acdf895e55", "0x64d94e792076da8df31d06e15e7ab4e152999c06", "0x8b245812b0755b7e0259395beca3e591734660fb", "0x13ef1ea93602873d11a92bc434c8ed580487b2dc", "0x18d91b5597f1a7227d2960945c9a1417f0ff721d", "0xdf264d5da8dfaa41fa2e634afead44935af2ad66"]) {
    const response = await onRequestGet({request: new Request("https://site.test/api/owned?contract=" + contract + "&owner=" + WALLET), env: {}});
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Alchemy NFT API/);
  }
});

test("fails closed when Alchemy or Base RPC is not configured", async () => {
  const noAlchemy = await onRequestGet({request: request(), env: {}});
  assert.equal(noAlchemy.status, 503);
  assert.match((await noAlchemy.json()).error, /Alchemy NFT API/);
  const noRpc = await onRequestGet({request: request(), env: {ALCHEMY_API_KEY: "test-key", ETHEREUM_API: "http://rpc.example"}});
  assert.equal(noRpc.status, 503);
  assert.match((await noRpc.json()).error, /Base mainnet RPC/);
});

test("returns only NFTs whose ownerOf result matches the connected wallet on Base", async t => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/getNFTsForOwner")) {
      calls.push({url, init});
      return new Response(JSON.stringify({ownedNfts: [
        {contract: {address: CONTRACT}, tokenId: "1", name: "Owned #1", image: {cachedUrl: "https://img.test/1.png"}},
        {contract: {address: CONTRACT}, tokenId: "2", name: "Transferred #2"},
        {contract: {address: CONTRACT}, tokenId: "3", name: "Burned #3"}
      ], pageKey: "next-page"}), {status: 200});
    }
    const body = JSON.parse(init.body);
    if (body.method === "eth_chainId") return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: "0x2105"}), {status: 200});
    const tokenId = BigInt("0x" + body.params[0].data.slice(-64)).toString();
    if (tokenId === "1") return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: ownerResult(WALLET)}), {status: 200});
    if (tokenId === "2") return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: ownerResult(OTHER)}), {status: 200});
    return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, error: {code: -32000, message: "execution reverted"}}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await onRequestGet({request: request({limit: 3}), env: {ALCHEMY_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get("owner"), WALLET);
  assert.equal(calls[0].url.searchParams.get("contractAddresses[]"), CONTRACT);
  assert.equal(calls[0].url.searchParams.get("pageSize"), "3");
  const body = await response.json();
  assert.equal(body.source, "alchemy+base-ownerOf");
  assert.equal(body.owner, WALLET);
  assert.equal(body.verifiedCount, 1);
  assert.equal(body.staleCount, 2);
  assert.equal(body.nfts[0].identifier, "1");
  assert.equal(body.nfts[0].verifiedOwner, true);
  assert.equal(body.next, "next-page");
});

test("rejects an RPC endpoint that does not report Base mainnet", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: "0x1"}), {status: 200});
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: request(), env: {ALCHEMY_API_KEY: "private-test-key"}});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Base mainnet/);
});


test("Polygon NodeMonkes inventory is verified with Polygon Alchemy and Polygon ownerOf", async t => {
  const originalFetch=globalThis.fetch,calls=[],contract="0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
  globalThis.fetch=async(input,init={})=>{const url=new URL(String(input));if(url.pathname.endsWith("/getNFTsForOwner")){calls.push(url);return new Response(JSON.stringify({ownedNfts:[{contract:{address:contract},tokenId:"9",name:"Polygon NodeMonke #9",image:{cachedUrl:"https://img.test/9.png"}}]}),{status:200})}const body=JSON.parse(init.body);if(body.method==="eth_chainId")return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:"0x89"}),{status:200});return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:ownerResult(WALLET)}),{status:200})};
  t.after(()=>{globalThis.fetch=originalFetch});
  const response=await onRequestGet({request:new Request("https://site.test/api/owned?contract="+contract+"&owner="+WALLET),env:{ALCHEMY_API_KEY:"private-test-key"}});
  assert.equal(response.status,200);assert.match(calls[0].hostname,/polygon-mainnet\.g\.alchemy\.com/);assert.equal(calls[0].searchParams.get("contractAddresses[]"),contract);const body=await response.json();assert.equal(body.source,"alchemy+polygon-ownerOf");assert.equal(body.verifiedCount,1);assert.equal(body.nfts[0].verifiedOwner,true);assert.match(body.nfts[0].opensea_url,/og\.rarible\.com\/token\/polygon/);
});

test("rejects a Base RPC endpoint for Polygon ownership verification",async t=>{const originalFetch=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:"0x2105"}),{status:200});t.after(()=>{globalThis.fetch=originalFetch});const response=await onRequestGet({request:new Request("https://site.test/api/owned?contract=0xdf264d5da8dfaa41fa2e634afead44935af2ad66&owner="+WALLET),env:{ALCHEMY_API_KEY:"private-test-key"}});assert.equal(response.status,503);assert.match((await response.json()).error,/Polygon mainnet/)});
