import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "./nfts.js";

test("NFT route asks OpenSea for the selected real collection trait and normalizes NFT attributes", async t => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, init) => {
    requested = {url: new URL(String(url)), init};
    return new Response(JSON.stringify({
      nfts: [{identifier: "1", name: "Punk #1", traits: [{trait_type: "Sex", value: "Female"}]}],
      next: null
    }), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const url = new URL("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&limit=2&traitType=Sex&traitValue=Female");
  const response = await onRequestGet({request: new Request(url), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.equal(requested.url.pathname, "/api/v2/collection/base-punks/nfts");
  assert.deepEqual(JSON.parse(requested.url.searchParams.get("traits")), [{traitType: "Sex", value: "Female"}]);
  assert.equal(requested.init.headers["x-api-key"], "private-test-key");
  const body = await response.json();
  assert.equal(body.source, "opensea-traits");
  assert.equal(body.nfts[0].metadata.attributes[0].trait_type, "Sex");
  assert.equal(body.nfts[0].metadata.attributes[0].value, "Female");
});

test("NFT route rejects incomplete or oversized trait filters", async () => {
  const url = new URL("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&traitType=Sex");
  const response = await onRequestGet({request: new Request(url), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 400);
});

test("trait scan reads 50 OpenSea NFTs per page and returns all NFT attributes and a cursor", async t => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url, init) => {
    requested = {url: new URL(String(url)), init};
    return new Response(JSON.stringify({nfts:[
      {identifier:"1",name:"Punk One",traits:[{trait_type:"Skin Tone",value:"Mid"},{trait_type:"Sex",value:"Female"}]},
      {identifier:"2",name:"Punk Two",metadata:{attributes:[{trait_type:"Skin Tone",value:"Light"}]}}
    ],next:"opaque-next-cursor"}),{status:200});
  };
  t.after(()=>{globalThis.fetch=originalFetch});
  const response=await onRequestGet({request:new Request("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&scanTraits=1&limit=50"),env:{OPENSEA_API_KEY:"private-test-key"}});
  assert.equal(response.status,200);
  assert.equal(requested.url.pathname,"/api/v2/chain/base/contract/0xb9110ba3266f4983193c0d5f55c792a94368af28/nfts");
  assert.equal(requested.url.searchParams.get("limit"),"50");
  assert.equal(requested.init.headers["x-api-key"],"private-test-key");
  const body=await response.json();
  assert.equal(body.source,"opensea-trait-index");
  assert.equal(body.nfts.length,2);
  assert.equal(body.nfts[0].metadata.attributes[0].value,"Mid");
  assert.equal(body.nfts[1].metadata.attributes[0].value,"Light");
  assert.match(body.next,/^os_/);
});

test("trait scan batch-loads attributes omitted from the paginated NFT feed",async t=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url:new URL(String(url)),init});
    if(calls.length===1)return new Response(JSON.stringify({nfts:[{identifier:"42",name:"Punk 42"}],next:null}),{status:200});
    return new Response(JSON.stringify({nfts:[{identifier:"42",traits:[{trait_type:"Skin Tone",value:"Olive"},{trait_type:"Sex",value:"Female"}]}]}),{status:200});
  };
  t.after(()=>{globalThis.fetch=originalFetch});
  const response=await onRequestGet({request:new Request("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&scanTraits=1"),env:{OPENSEA_API_KEY:"private-test-key"}});
  assert.equal(response.status,200);
  assert.equal(calls.length,2);
  assert.equal(calls[1].url.pathname,"/api/v2/nfts/batch");
  assert.equal(calls[1].init.method,"POST");
  assert.deepEqual(JSON.parse(calls[1].init.body),{identifiers:[{chain:"base",contract_address:"0xb9110ba3266f4983193c0d5f55c792a94368af28",token_id:"42"}]});
  const body=await response.json();
  assert.equal(body.nfts[0].metadata.attributes[0].value,"Olive");
});

test("trait scan follows provider cursors and clamps its page size at 50", async t => {
  const originalFetch=globalThis.fetch;
  let requestedUrl;
  globalThis.fetch=async url=>{
    requestedUrl=new URL(String(url));
    return new Response(JSON.stringify({nfts:[],next:null}),{status:200});
  };
  t.after(()=>{globalThis.fetch=originalFetch});
  const cursor="os_"+btoa("cursor-page-2").replace(/=/g,"");
  const response=await onRequestGet({request:new Request(`https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&scanTraits=1&limit=100&next=${cursor}`),env:{OPENSEA_API_KEY:"private-test-key"}});
  assert.equal(response.status,200);
  assert.equal(requestedUrl.searchParams.get("limit"),"50");
  assert.equal(requestedUrl.searchParams.get("next"),"cursor-page-2");
  assert.equal((await response.json()).next,null);
});

test("trait scan fails closed when OpenSea is not configured", async () => {
  const response=await onRequestGet({request:new Request("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&scanTraits=1"),env:{}});
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/OpenSea API is required/);
});

test("trait scan rejects opaque or empty OpenSea cursors instead of restarting page one",async t=>{
  const originalFetch=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{
    calls++;
    return new Response(JSON.stringify({nfts:[],next:null}),{status:200});
  };
  t.after(()=>{globalThis.fetch=originalFetch});

  for(const cursor of ["opaque-cursor","os_"]){
    const response=await onRequestGet({
      request:new Request("https://site.test/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&scanTraits=1&next="+cursor),
      env:{OPENSEA_API_KEY:"private-test-key"}
    });
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/cursor/i);
  }
  assert.equal(calls,0);
});


test("CryptoPunks [Base] collection feed is served from its OpenSea contract endpoint", async t => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(String(url));
    return new Response(JSON.stringify({nfts: [{identifier: "7", name: "CryptoPunk #7", traits: []}], next: null}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/nfts?contract=0x18d91b5597f1a7227d2960945c9a1417f0ff721d&limit=2"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.equal(requested.pathname, "/api/v2/chain/base/contract/0x18d91b5597f1a7227d2960945c9a1417f0ff721d/nfts");
  const body = await response.json();
  assert.equal(body.source, "opensea");
  assert.equal(body.nfts[0].identifier, "7");
});


test("Polygon NodeMonkes NFTs and trait scans use the Polygon Alchemy feed and pg cursor", async t => {
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,init={})=>{const parsed=new URL(String(url));calls.push({url:parsed,init});return new Response(JSON.stringify({nfts:[{tokenId:"1",name:"NodeMonke #1",image:{cachedUrl:"https://img.test/1.png"},raw:{metadata:{attributes:[{trait_type:"Head",value:"Crown"}]}}}],pageKey:"polygon-page-2"}),{status:200})};
  t.after(()=>{globalThis.fetch=originalFetch});
  const contract="0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
  const response=await onRequestGet({request:new Request("https://site.test/api/nfts?contract="+contract+"&scanTraits=1&limit=50"),env:{ALCHEMY_API_KEY:"polygon-test-key"}});
  assert.equal(response.status,200);assert.match(calls[0].url.hostname,/polygon-mainnet\.g\.alchemy\.com/);assert.equal(calls[0].url.pathname.endsWith("/getNFTsForContract"),true);assert.equal(calls[0].url.searchParams.get("contractAddress"),contract);assert.equal(calls[0].url.searchParams.get("limit"),"50");
  const body=await response.json();assert.equal(body.source,"alchemy-trait-index");assert.equal(body.nfts[0].metadata.attributes[0].value,"Crown");assert.match(body.next,/^pg_/);
});

test("Polygon NodeMonkes OpenSea trait scans accept the next OpenSea cursor", async t => {
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async(url)=>{const parsed=new URL(String(url));calls.push(parsed);return new Response(JSON.stringify({nfts:[{identifier:calls.length,name:"NodeMonke #"+calls.length,traits:[{trait_type:"Head",value:"Crown"}]}],next:calls.length===1?"page-two":null}),{status:200})};
  t.after(()=>{globalThis.fetch=originalFetch});
  const contract="0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
  const first=await onRequestGet({request:new Request("https://site.test/api/nfts?contract="+contract+"&scanTraits=1&limit=50"),env:{OPENSEA_API_KEY:"polygon-opensea-key"}});
  assert.equal(first.status,200);const firstBody=await first.json();assert.match(firstBody.next,/^os_/);
  const second=await onRequestGet({request:new Request("https://site.test/api/nfts?contract="+contract+"&scanTraits=1&limit=50&next="+encodeURIComponent(firstBody.next)),env:{OPENSEA_API_KEY:"polygon-opensea-key"}});
  assert.equal(second.status,200);assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get("next"),"page-two");
});

test("Polygon NFT route rejects OpenSea cursors instead of restarting pagination", async t => {
  let calls=0;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{calls++;return new Response("{}",{status:200})};t.after(()=>{globalThis.fetch=originalFetch});
  const response=await onRequestGet({request:new Request("https://site.test/api/nfts?contract=0xdf264d5da8dfaa41fa2e634afead44935af2ad66&next=os_bad"),env:{ALCHEMY_API_KEY:"test"}});
  assert.equal(response.status,400);assert.match((await response.json()).error,/Polygon pagination cursor/);assert.equal(calls,0);
});
