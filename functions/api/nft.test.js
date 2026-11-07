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
