import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/trade.js";

const CONTRACT = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const SEAPORT = "0x0000000000000068f116a894984e2db1123eb395";
const HASH = "0x" + "a".repeat(64);

function request(action, body, { method = "POST", contract = CONTRACT, tokenId = "1" } = {}) {
  const url = new URL("https://market.test/api/trade");
  url.searchParams.set("action", action);
  url.searchParams.set("contract", contract);
  url.searchParams.set("tokenId", tokenId);
  return new Request(url, {
    method,
    headers: { origin: "https://market.test", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function fulfillmentBody(overrides = {}) {
  return {
    fulfiller: { address: "0x1111111111111111111111111111111111111111" },
    listing: {
      order_hash: HASH,
      chain: "base",
      protocol_address: SEAPORT,
      asset: { contract: CONTRACT, identifier: "1" }
    },
    ...overrides
  };
}

test("rejects methods other than GET and POST", async () => {
  const response = await onRequest({ request: new Request("https://market.test/api/trade", { method: "DELETE" }), env: {} });
  assert.equal(response.status, 405);
  assert.match((await response.json()).error, /Method not allowed/);
});

test("requires same-origin for POST writes", async () => {
  const req = new Request("https://market.test/api/trade?action=fulfill-listing&contract=" + CONTRACT + "&tokenId=1", {
    method: "POST",
    headers: { origin: "https://attacker.test", "content-type": "application/json" },
    body: JSON.stringify(fulfillmentBody())
  });
  const response = await onRequest({ request: req, env: { BASE_SEAPORT_ADDRESS: SEAPORT } });
  assert.equal(response.status, 403);
});

test("rejects non-allowlisted NFT contracts", async () => {
  const response = await onRequest({
    request: request("fulfill-listing", fulfillmentBody(), { contract: "0x2222222222222222222222222222222222222222" }),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Unsupported collection/);
});

test("rejects fulfillment requests for a non-Base order", async () => {
  const body = fulfillmentBody({ listing: { ...fulfillmentBody().listing, chain: "ethereum" } });
  const response = await onRequest({
    request: request("fulfill-listing", body),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Only Base mainnet/);
});


test("uses same-chain listing fulfillment with an explicit Base chain", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/listings/fulfillment_data"), "expected standard listing fulfillment endpoint");
    const payload = JSON.parse(init.body);
    assert.equal(payload.listing.hash, HASH);
    assert.equal(payload.consideration.contract, CONTRACT);
    assert.equal(payload.consideration.asset_contract_address, CONTRACT);
    assert.equal(payload.consideration.token_id, "1");
    assert.equal(payload.listing.chain, "base");
    assert.equal(payload.listing.protocol_address, SEAPORT);
    assert.equal(payload.listing.contract, CONTRACT);
    assert.equal(payload.listing.token_id, "1");
    assert.equal(payload.fulfiller.address, "0x1111111111111111111111111111111111111111");
    assert.equal(payload.include_optional_creator_fees, false);
    return new Response(JSON.stringify({ fulfillment_data: { transaction: { chain: "base", to: "0x1111111111111111111111111111111111111111", data: "0x12345678", value: "0" } } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await onRequest({
      request: request("fulfill-listing", fulfillmentBody()),
      env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.fulfillment_data.transaction.chain, "base");
    assert.equal(data.fulfillment_data.transaction.data, "0x12345678");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a mismatched Seaport protocol address", async () => {
  const body = fulfillmentBody({ listing: { ...fulfillmentBody().listing, protocol_address: "0x3333333333333333333333333333333333333333" } });
  const response = await onRequest({
    request: request("fulfill-listing", body),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not match/);
});

test("rejects an NFT/token mismatch in the order", async () => {
  const body = fulfillmentBody({ listing: { ...fulfillmentBody().listing, asset: { contract: CONTRACT, identifier: "2" } } });
  const response = await onRequest({
    request: request("fulfill-listing", body),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /must match/);
});

test("fails closed when the server-side OpenSea API key is missing", async () => {
  const response = await onRequest({
    request: request("listings", undefined, { method: "GET" }),
    env: {}
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /not configured/);
});


test("validates listing-action requests before contacting OpenSea", async () => {
  const body = {
    address: "0x1111111111111111111111111111111111111111",
    items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, expiration_time: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, price: { currency: "ETH", amount: "0.05" } }]
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /api\.opensea\.io\/api\/v2\/listings\/actions$/);
    assert.equal(init.method, "POST");
    assert.equal(Object.hasOwn(JSON.parse(init.body), "chain"), false, "chain belongs on the item, not the top-level payload");
    assert.equal(JSON.parse(init.body).items[0].chain, "base", "OpenSea requires chain on each listing item");
    assert.equal(Object.hasOwn(JSON.parse(init.body).items[0], "nft_id"), false, "OpenSea listing-actions schema rejects nft_id");
    assert.equal(JSON.parse(init.body).items[0].contract, CONTRACT);
    assert.equal(JSON.parse(init.body).items[0].token_id, "1");
    assert.ok(JSON.parse(init.body).items[0].expiration_time > Math.floor(Date.now() / 1000));
    assert.ok(JSON.parse(init.body).items[0].expiration_time <= Math.floor(Date.now() / 1000) + 180 * 24 * 60 * 60);
    return new Response(JSON.stringify({ steps: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("listing-actions", body),
      env: { OPENSEA_API: "test-key" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { steps: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects listing-action requests for a mismatched NFT", async () => {
  const response = await onRequest({
    request: request("listing-actions", {
      address: "0x1111111111111111111111111111111111111111",
      items: [{ nft_id: "base/" + CONTRACT + "/2", quantity: 1, price: { currency: "ETH", amount: "0.05" } }]
    }),
    env: { OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /must match/);
});

test("rejects non-positive listing prices", async () => {
  const response = await onRequest({
    request: request("listing-actions", {
      address: "0x1111111111111111111111111111111111111111",
      items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, price: { currency: "ETH", amount: "0" } }]
    }),
    env: { OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
});

test("preserves upstream OpenSea status and details for diagnosis", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: ["Invalid API key or missing permission"] }), {
    status: 403,
    headers: { "content-type": "application/json" }
  });
  try {
    const response = await onRequest({
      request: request("listings", undefined, { method: "GET" }),
      env: { OPENSEA_API: "test-key" }
    });
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.providerStatus, 403);
    assert.deepEqual(data.details, ["Invalid API key or missing permission"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("uses current OpenSea best-listing endpoint and returns the UI-compatible shape", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/listings/collection/base-punks/nfts/1/best"));
    assert.equal(new Headers(init.headers).get("x-api-key"), "test-key");
    return new Response(JSON.stringify({
      asset: { contract: CONTRACT, identifier: "1" },
      status: "ACTIVE",
      order_hash: HASH,
      price: { current: { value: "10000000000000000", currency: "ETH" } }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("listings", undefined, { method: "GET" }),
      env: { OPENSEA_API: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.orders.length, 1);
    assert.equal(data.listings[0].order_hash, HASH);
  } finally { globalThis.fetch = originalFetch; }
});

test("returns an empty order list when OpenSea has no best offer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith("/api/v2/offers/collection/base-punks/nfts/1/best"));
    return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
  };
  try {
    const response = await onRequest({
      request: request("offers", undefined, { method: "GET" }),
      env: { OPENSEA_API: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.orders, []);
    assert.deepEqual(data.offers, []);
  } finally { globalThis.fetch = originalFetch; }
});


test("rejects listing expirations beyond six months", async () => {
  const response = await onRequest({
    request: request("listing-actions", {
      address: "0x1111111111111111111111111111111111111111",
      items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, expiration_time: Math.floor(Date.now() / 1000) + 181 * 24 * 60 * 60, price: { currency: "ETH", amount: "0.05" } }]
    }),
    env: { OPENSEA_API: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /between 15 minutes and 6 months/);
});
