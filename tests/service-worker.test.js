import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const source=await readFile(new URL("../public/sw.js",import.meta.url),"utf8");

async function dispatch(request){
  const handlers=new Map();
  const stats={cacheMatches:0,cachePuts:0,networkRequests:0};
  const cache={
    match:async()=>{stats.cacheMatches++;return new Response("stale cache",{status:200})},
    put:async()=>{stats.cachePuts++},
    addAll:async()=>{}
  };
  const sandbox={
    self:{location:{origin:"https://site.test"},addEventListener:(name,handler)=>handlers.set(name,handler),skipWaiting:()=>{},clients:{claim:()=>{}}},
    caches:{open:async()=>cache,match:cache.match,keys:async()=>[],delete:async()=>{}},
    fetch:async()=>{stats.networkRequests++;return new Response("fresh network",{status:200})},
    URL,Promise,Response
  };
  vm.runInNewContext(source,sandbox);
  let responsePromise;
  handlers.get("fetch")({request,respondWith:promise=>{responsePromise=Promise.resolve(promise)}});
  return {response:await responsePromise,stats};
}

test("same-origin API requests bypass Cache Storage even when a stale response exists",async()=>{
  const request=new Request("https://site.test/api/nfts?contract=0xabc&scanTraits=1&limit=50",{cache:"no-store"});
  const {response,stats}=await dispatch(request);
  assert.equal(await response.text(),"fresh network");
  assert.equal(stats.cacheMatches,0);
  assert.equal(stats.cachePuts,0);
  assert.equal(stats.networkRequests,1);
});

test("explicit no-store requests bypass Cache Storage outside the API routes",async()=>{
  const request=new Request("https://site.test/assets/current-app.js",{cache:"no-store"});
  const {response,stats}=await dispatch(request);
  assert.equal(await response.text(),"fresh network");
  assert.equal(stats.cacheMatches,0);
  assert.equal(stats.cachePuts,0);
  assert.equal(stats.networkRequests,1);
});
