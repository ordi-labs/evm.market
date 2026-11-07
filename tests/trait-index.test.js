import test from "node:test";
import assert from "node:assert/strict";
import {IDBFactory} from "fake-indexeddb";
import {readTraitIndex,scanTraitIndex} from "../trait-index.js";

const CONTRACT="0xb9110ba3266f4983193c0d5f55c792a94368af28";

function setup(t,fetchImpl){
  const originalIndexedDB=globalThis.indexedDB;
  const originalFetch=globalThis.fetch;
  globalThis.indexedDB=new IDBFactory();
  globalThis.fetch=fetchImpl;
  t.after(()=>{
    globalThis.indexedDB=originalIndexedDB;
    globalThis.fetch=originalFetch;
  });
}

function page(nfts,next){return new Response(JSON.stringify({nfts,next,source:"test"}),{status:200});}

test("trait scan detects a repeated cursor and leaves a restartable checkpoint",async t=>{
  let calls=0;
  setup(t,async()=>{
    calls++;
    return page([{identifier:String(calls),traits:[{trait_type:"Sex",value:"Female"}]}],"cursor-a");
  });

  await assert.rejects(scanTraitIndex({contract:CONTRACT}),/répété/);
  const cached=await readTraitIndex(CONTRACT);
  assert.equal(calls,2);
  assert.equal(cached.nfts.length,2);
  assert.equal(cached.scan.next,null);
  assert.equal(cached.scan.exhausted,false);
});

test("an exhausted incomplete scan can be explicitly restarted without losing saved NFTs",async t=>{
  let calls=0;
  setup(t,async()=>{
    calls++;
    const nfts=calls===1
      ? [{identifier:"1",traits:[{trait_type:"Sex",value:"Female"}]}]
      : [{identifier:"1",traits:[{trait_type:"Sex",value:"Female"}]},{identifier:"2",traits:[{trait_type:"Sex",value:"Male"}]}];
    return page(nfts,null);
  });

  const first=await scanTraitIndex({contract:CONTRACT});
  assert.equal(first.complete,false);
  assert.equal(first.scan.exhausted,true);
  const cached=await scanTraitIndex({contract:CONTRACT});
  assert.equal(calls,1);
  assert.equal(cached.nfts.length,1);

  const retried=await scanTraitIndex({contract:CONTRACT,restartIncomplete:true});
  assert.equal(calls,2);
  assert.equal(retried.nfts.length,2);
  assert.equal(retried.nfts.find(nft=>nft.identifier==="2").metadata.attributes[0].value,"Male");
  assert.equal(retried.complete,false);
  assert.equal(retried.scan.exhausted,true);
});

test("a rejected saved cursor resets to page one and preserves the local index",async t=>{
  const controller=new AbortController();
  setup(t,async()=>page([{identifier:"1",traits:[{trait_type:"Sex",value:"Female"}]}],"os_bm9wZQ"));
  await assert.rejects(scanTraitIndex({contract:CONTRACT,signal:controller.signal,onProgress:()=>controller.abort()}),{name:"AbortError"});

  let calls=0;
  globalThis.fetch=async input=>{
    calls++;
    const url=new URL(String(input),"https://site.test");
    if(calls===1){
      assert.equal(url.searchParams.get("next"),"os_bm9wZQ");
      return new Response(JSON.stringify({error:"Invalid collection scan cursor."}),{status:400});
    }
    assert.equal(url.searchParams.has("next"),false);
    return page([
      {identifier:"1",traits:[{trait_type:"Sex",value:"Female"}]},
      {identifier:"2",traits:[{trait_type:"Sex",value:"Male"}]}
    ],null);
  };

  const result=await scanTraitIndex({contract:CONTRACT});
  assert.equal(calls,2);
  assert.equal(result.nfts.length,2);
  assert.equal(result.nfts.find(nft=>nft.identifier==="1").metadata.attributes[0].value,"Female");
});
