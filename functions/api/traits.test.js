import {test} from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "./traits.js";

test("traits route only accepts the three configured collection contracts", async () => {
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x0000000000000000000000000000000000000001"), env: {OPENSEA_API: "test"}});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported collection/);
});

test("traits route proxies collection facets server-side and caches the result", async t => {
  const originalFetch = globalThis.fetch;
  let called = "";
  globalThis.fetch = async (url, init) => {
    called = String(url);
    assert.equal(init.headers["x-api-key"], "private-test-key");
    return new Response(JSON.stringify({traits: [{trait_type: "Sex", values: [{value: "Female", count: 3840}]}]}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28"), env: {OPENSEA_API: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.match(called, /\/traits\/base-punks$/);
  assert.match(response.headers.get("cache-control"), /s-maxage=300/);
  const body = await response.json();
  assert.equal(body.traits[0].trait_type, "Sex");
});

test("traits route preserves OpenSea rate-limit wait guidance", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({detail: "rate limited"}), {status: 429, headers: {"retry-after": "8"}});
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequestGet({request: new Request("https://site.test/api/traits?contract=0x095b6ae2102094be8b5f06fac27275ddb9a8c70a"), env: {OPENSEA_API: "private-test-key"}});
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "8");
  assert.equal((await response.json()).providerStatus, 429);
});
