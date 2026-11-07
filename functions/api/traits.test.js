import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "./traits.js";

test("traits route rejects contracts outside the configured collection allowlist", async () => {
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x0000000000000000000000000000000000000001"), env: {OPENSEA_API_KEY: "test"}});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported collection/);
});

test("traits route proxies the official collection facet endpoint", async t => {
  const originalFetch = globalThis.fetch;
  let called = "";
  globalThis.fetch = async (url, init) => {
    called = String(url);
    assert.equal(init.headers["x-api-key"], "private-test-key");
    return new Response(JSON.stringify({categories: {Sex: "string"}, counts: {Sex: {Female: 10}}}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.match(called, /\/traits\/base-punks$/);
  assert.match(response.headers.get("cache-control"), /s-maxage=300/);
  const body = await response.json();
  assert.equal(body.traits.categories.Sex, "string");
  assert.equal(body.traits.counts.Sex.Female, 10);
});

test("traits route batches real NFT traits using exact Base identifiers", async t => {
  const originalFetch = globalThis.fetch;
  let called = "", init;
  globalThis.fetch = async (url, options) => {
    called = String(url); init = options;
    return new Response(JSON.stringify({nfts: [
      {identifier: "1", traits: [{trait_type: "Sex", value: "Female"}, {trait_type: "Background", value: "Purple"}]},
      {identifier: "2", traits: [{trait_type: "Sex", value: "Male"}]}
    ]}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&tokenIds=1,2"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.match(called, /\/nfts\/batch$/);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-api-key"], "private-test-key");
  assert.deepEqual(JSON.parse(init.body), {identifiers: [
    {chain: "base", contract_address: "0xb9110ba3266f4983193c0d5f55c792a94368af28", token_id: "1"},
    {chain: "base", contract_address: "0xb9110ba3266f4983193c0d5f55c792a94368af28", token_id: "2"}
  ]});
  const body = await response.json();
  assert.equal(body.source, "opensea-batch");
  assert.deepEqual(body.nftTraits["1"], [{trait_type: "Sex", value: "Female"}, {trait_type: "Background", value: "Purple"}]);
  assert.deepEqual(body.nftTraits["2"], [{trait_type: "Sex", value: "Male"}]);
});

test("traits batch normalizes camelCase and key aliases for NodeMonkes", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({nfts: [{identifier: "8", traits: [
    {traitType: "Head", value: "Crown"}, {key: "Eyes", value: "Laser"}
  ]}]}), {status: 200});
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x095b6ae2102094be8b5f06fac27275ddb9a8c70a&tokenIds=8"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.nftTraits["8"], [{trait_type: "Head", value: "Crown"}, {trait_type: "Eyes", value: "Laser"}]);
});

test("traits batch rejects invalid token IDs or more than 50 NFTs", async () => {
  for (const tokenIds of ["1,abc", Array.from({length: 51}, (_, i) => i + 1).join(",")]) {
    const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x095b6ae2102094be8b5f06fac27275ddb9a8c70a&tokenIds=" + tokenIds), env: {OPENSEA_API_KEY: "private-test-key"}});
    assert.equal(response.status, 400);
  }
});

test("traits route preserves OpenSea rate-limit wait guidance", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({detail: "rate limited"}), {status: 429, headers: {"retry-after": "8"}});
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x095b6ae2102094be8b5f06fac27275ddb9a8c70a"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "8");
  assert.equal((await response.json()).providerStatus, 429);
});


test("CryptoPunks [Base] traits resolve through its OpenSea collection slug", async t => {
  const originalFetch = globalThis.fetch;
  let called = "";
  globalThis.fetch = async url => {
    called = String(url);
    return new Response(JSON.stringify({traits: {categories: {}}}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x18d91b5597f1a7227d2960945c9a1417f0ff721d"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.match(called, /\/traits\/cryptopunks-base$/);
  assert.equal((await response.json()).collection, "cryptopunks-base");
});
