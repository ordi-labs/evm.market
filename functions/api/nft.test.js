import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "./nft.js";

const CONTRACT = "0x18d91b5597f1a7227d2960945c9a1417f0ff721d";

test("CryptoPunks [Base] detail uses OpenSea and links to the matching Base asset", async t => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(String(url));
    return new Response(JSON.stringify({nft: {
      identifier: "7",
      name: "CryptoPunk #7",
      image_url: "https://images.example/7.png",
      traits: [{trait_type: "Type", value: "Alien"}]
    }}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await onRequestGet({
    request: new Request(`https://site.test/api/nft?contract=${CONTRACT}&tokenId=7`),
    env: {OPENSEA_API_KEY: "private-test-key"}
  });
  assert.equal(response.status, 200);
  assert.equal(requested.pathname, `/api/v2/chain/base/contract/${CONTRACT}/nfts/7`);
  const body = await response.json();
  assert.equal(body.source, "opensea");
  assert.equal(body.marketplaceUrl, `https://opensea.io/assets/base/${CONTRACT}/7`);
  assert.deepEqual(body.traits, [{trait_type: "Type", value: "Alien", display_type: ""}]);
});


test("Polygon NodeMonkes detail reads Polygon Alchemy and links back to Rarible",async t=>{const originalFetch=globalThis.fetch;let requested;globalThis.fetch=async url=>{requested=new URL(String(url));return new Response(JSON.stringify({tokenId:"7",name:"NodeMonke #7",image:{cachedUrl:"https://img.test/7.png"},raw:{metadata:{attributes:[{trait_type:"Eyes",value:"Laser"}]}}}),{status:200})};t.after(()=>{globalThis.fetch=originalFetch});const contract="0xdf264d5da8dfaa41fa2e634afead44935af2ad66";const response=await onRequestGet({request:new Request("https://site.test/api/nft?contract="+contract+"&tokenId=7"),env:{ALCHEMY_API_KEY:"test-key"}});assert.equal(response.status,200);assert.match(requested.hostname,/polygon-mainnet\.g\.alchemy\.com/);assert.equal(requested.searchParams.get("contractAddress"),contract);const body=await response.json();assert.equal(body.source,"alchemy");assert.equal(body.marketplaceUrl,"https://og.rarible.com/token/polygon/"+contract+":7");assert.deepEqual(body.traits,[{trait_type:"Eyes",value:"Laser",display_type:""}])});
