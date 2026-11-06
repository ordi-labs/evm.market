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
  const response = await onRequestGet({request: new Request(url), env: {OPENSEA_API: "private-test-key"}});
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
  const response = await onRequestGet({request: new Request(url), env: {OPENSEA_API: "private-test-key"}});
  assert.equal(response.status, 400);
});
