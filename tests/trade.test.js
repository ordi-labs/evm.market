import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/trade.js";

const CONTRACT = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const SEAPORT = "0x0000000000000068f116a894984e2db1123eb395";
const HASH = "0x" + "a".repeat(64);
const WETH = "0x4200000000000000000000000000000000000006";
const POLYGON_CONTRACT = "0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
const POLYGON_WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
function futureIso(months) { const d = new Date(); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString(); }

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


function signedOrderBody(side = "listing", expiryMonths = side === "listing" ? 6 : 1) {
  const nft = { itemType: 2, token: CONTRACT, identifierOrCriteria: "1", startAmount: "1", endAmount: "1" };
  const payment = { itemType: side === "listing" ? 0 : 1, token: side === "listing" ? "0x0000000000000000000000000000000000000000" : WETH, identifierOrCriteria: "0", startAmount: "50000000000000000", endAmount: "50000000000000000", ...(side === "listing" ? { recipient: "0x1111111111111111111111111111111111111111" } : {}) };
  const now = Math.floor(Date.now() / 1000);
  return {
    expected: { amount: "0.05", currency: side === "listing" ? "ETH" : "WETH" },
    parameters: {
      offerer: "0x1111111111111111111111111111111111111111",
      offer: side === "listing" ? [nft] : [payment],
      consideration: side === "listing" ? [payment] : [nft],
      startTime: String(now),
      endTime: String(Math.floor(Date.parse(futureIso(expiryMonths)) / 1000))
    },
    protocol_address: SEAPORT,
    signature: "0x" + "1".repeat(130)
  };
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
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API_KEY: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Only Base mainnet/);
});


test("uses same-chain listing fulfillment with an explicit Base chain", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/listings/cross_chain_fulfillment_data"), "expected ready-to-send fulfillment endpoint");
    const payload = JSON.parse(init.body);
    assert.equal(payload.listings[0].hash, HASH);
    assert.equal(payload.listings[0].chain, "base");
    assert.equal(payload.listings[0].protocol_address, SEAPORT);
    assert.equal(payload.payment.chain, "base");
    assert.equal(payload.payment.token_address, "0x0000000000000000000000000000000000000000");
    assert.equal(payload.fulfiller.address, "0x1111111111111111111111111111111111111111");
    return new Response(JSON.stringify({ transactions: [{ chain: "base", to: "0x1111111111111111111111111111111111111111", data: "0x12345678", value: "0", value_hex: "0x0" }] }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await onRequest({
      request: request("fulfill-listing", fulfillmentBody()),
      env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.transactions[0].chain, "base");
    assert.equal(data.transactions[0].data, "0x12345678");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses the official offer fulfillment schema without unsupported root fields", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/offers/fulfillment_data"));
    const payload = JSON.parse(init.body);
    assert.equal(payload.offer.hash, HASH);
    assert.equal(payload.offer.chain, "base");
    assert.equal(payload.offer.protocol_address, SEAPORT);
    assert.equal(payload.consideration.asset_contract_address, CONTRACT);
    assert.equal(payload.consideration.token_id, "1");
    assert.equal(Object.hasOwn(payload, "chain"), false);
    assert.equal(Object.hasOwn(payload.consideration, "contract"), false);
    assert.equal(Object.hasOwn(payload, "recipient"), false);
    return new Response(JSON.stringify({ fulfillment_data: { transaction: { chain: "base", data: "0x12345678" } } }), { status: 200 });
  };
  try {
    const body = fulfillmentBody({
      listing: undefined,
      offer: {
        order_hash: HASH,
        chain: "base",
        protocol_address: SEAPORT,
        asset: { contract: CONTRACT, identifier: "1" }
      }
    });
    const response = await onRequest({
      request: request("fulfill-offer", body),
      env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a mismatched Seaport protocol address", async () => {
  const body = fulfillmentBody({ listing: { ...fulfillmentBody().listing, protocol_address: "0x3333333333333333333333333333333333333333" } });
  const response = await onRequest({
    request: request("fulfill-listing", body),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API_KEY: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not match/);
});

test("rejects an NFT/token mismatch in the order", async () => {
  const body = fulfillmentBody({ listing: { ...fulfillmentBody().listing, asset: { contract: CONTRACT, identifier: "2" } } });
  const response = await onRequest({
    request: request("fulfill-listing", body),
    env: { BASE_SEAPORT_ADDRESS: SEAPORT, OPENSEA_API_KEY: "test-key" }
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
    items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, price: { currency: "ETH", amount: "0.05" }, end_time: futureIso(6) }]
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
    assert.equal(JSON.parse(init.body).items[0].price.currency, "0x0000000000000000000000000000000000000000");
    assert.ok(Date.parse(JSON.parse(init.body).items[0].end_time) > Date.now());
    assert.ok(Date.parse(JSON.parse(init.body).items[0].end_time) <= Date.parse(futureIso(6)) + 60_000);
    return new Response(JSON.stringify({ steps: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("listing-actions", body),
      env: { OPENSEA_API_KEY: "test-key" }
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
      items: [{ nft_id: "base/" + CONTRACT + "/2", quantity: 1, price: { currency: "ETH", amount: "0.05" }, end_time: futureIso(6) }]
    }),
    env: { OPENSEA_API_KEY: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /must match/);
});

test("rejects non-positive listing prices", async () => {
  const response = await onRequest({
    request: request("listing-actions", {
      address: "0x1111111111111111111111111111111111111111",
      items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, price: { currency: "ETH", amount: "0" }, end_time: futureIso(6) }]
    }),
    env: { OPENSEA_API_KEY: "test-key" }
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
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.providerStatus, 403);
    assert.deepEqual(data.details, ["Invalid API key or missing permission"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("proxies a paginated collection-wide OpenSea best-listing feed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.pathname, "/api/v2/listings/collection/punks-base-1/best");
    assert.equal(requestUrl.searchParams.get("limit"), "200");
    assert.equal(requestUrl.searchParams.get("next"), "page-two");
    assert.equal(new Headers(init.headers).get("x-api-key"), "test-key");
    return new Response(JSON.stringify({listings: [
      {chain: "base", asset: {contract: CONTRACT, identifier: "25"}, order_hash: HASH},
      {chain: "ethereum", asset: {contract: "0x3a314d38b6e174240046bd2feb47f0d5d655c569", identifier: "25"}, order_hash: "foreign-order"}
    ], next: "page-three"}), {status: 200});
  };
  try {
    const url = new URL("https://market.test/api/trade?action=collection-listings&contract=" + CONTRACT + "&limit=200&next=page-two");
    const response = await onRequest({request: new Request(url), env: {OPENSEA_API_KEY: "test-key"}});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.listings.length, 1);
    assert.equal(data.listings[0].asset.identifier, "25");
    assert.equal(data.next, "page-three");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("proxies active NodeMonkes Polygon listings through Rarible", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.pathname, "/v0.1/orders/sell/byCollection");
    assert.equal(requestUrl.searchParams.get("collection"), "POLYGON:" + POLYGON_CONTRACT);
    assert.equal(requestUrl.searchParams.get("continuation"), "page-two");
    assert.equal(new Headers(init.headers).get("x-api-key"), "rarible-test-key");
    return new Response(JSON.stringify({
      orders: [{
        id: "rarible-order-1",
        status: "ACTIVE",
        make: { assetType: { assetClass: "ERC721", contract: POLYGON_CONTRACT, tokenId: "25" } }
      }],
      continuation: "page-three"
    }), { status: 200 });
  };
  try {
    const url = new URL("https://market.test/api/trade?action=collection-listings&contract=" + POLYGON_CONTRACT + "&limit=200&next=page-two");
    const response = await onRequest({ request: new Request(url), env: { RARIBLE_API_KEY: "rarible-test-key" } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.source, "rarible");
    assert.equal(data.listings[0].asset.contract, POLYGON_CONTRACT);
    assert.equal(data.listings[0].asset.identifier, "25");
    assert.equal(data.next, "page-three");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validates collection listing contract and page limit before contacting OpenSea", async () => {
  const invalidContract = await onRequest({
    request: new Request("https://market.test/api/trade?action=collection-listings&contract=0x1111111111111111111111111111111111111111"),
    env: {OPENSEA_API_KEY: "test-key"}
  });
  assert.equal(invalidContract.status, 400);
  const invalidLimit = await onRequest({
    request: new Request("https://market.test/api/trade?action=collection-listings&contract=" + CONTRACT + "&limit=201"),
    env: {OPENSEA_API_KEY: "test-key"}
  });
  assert.equal(invalidLimit.status, 400);
});

test("uses current OpenSea best-listing endpoint and returns the UI-compatible shape", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/listings/collection/punks-base-1/nfts/1/best"));
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
      env: { OPENSEA_API_KEY: "test-key" }
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
    assert.ok(String(url).endsWith("/api/v2/offers/collection/punks-base-1/nfts/1/best"));
    return new Response(JSON.stringify({ detail: "Not found" }), { status: 404 });
  };
  try {
    const response = await onRequest({
      request: request("offers", undefined, { method: "GET" }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.orders, []);
    assert.deepEqual(data.offers, []);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects a best listing returned for a different contract or chain", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    chain: "ethereum",
    asset: { contract: "0x3a314d38b6e174240046bd2feb47f0d5d655c569", identifier: "1" },
    status: "ACTIVE",
    order_hash: HASH
  }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const response = await onRequest({
      request: request("listings", undefined, { method: "GET" }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.orders, []);
    assert.deepEqual(data.listings, []);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects listings longer than six months", async () => {
  const tooLong = futureIso(7);
  const response = await onRequest({
    request: request("listing-actions", {
      address: "0x1111111111111111111111111111111111111111",
      items: [{ nft_id: "base/" + CONTRACT + "/1", quantity: 1, price: { currency: "ETH", amount: "0.05" }, end_time: tooLong }]
    }),
    env: { OPENSEA_API_KEY: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /cannot be more than 6 month/);
});

test("builds Base OpenSea offer actions using WETH and a bounded expiry", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/offers/actions"));
    assert.equal(init.method, "POST");
    const payload = JSON.parse(init.body);
    assert.equal(payload.address, "0x1111111111111111111111111111111111111111");
    assert.deepEqual(payload.item, { chain: "base", contract: CONTRACT, token_id: "1" });
    assert.equal(payload.price.currency, WETH);
    assert.equal(payload.price.amount, "0.2");
    assert.equal(payload.quantity, 1);
    assert.ok(Date.parse(payload.end_time) > Date.now());
    return new Response(JSON.stringify({ steps: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("offer-actions", {
        address: "0x1111111111111111111111111111111111111111",
        item: { chain: "base", contract: CONTRACT, token_id: "1" },
        quantity: 1,
        price: { currency: WETH, amount: "0.2" },
        end_time: futureIso(1)
      }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { steps: [] });
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects an offer with a mismatched NFT before contacting OpenSea", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const response = await onRequest({
      request: request("offer-actions", {
        address: "0x1111111111111111111111111111111111111111",
        item: { chain: "base", contract: CONTRACT, token_id: "2" },
        quantity: 1,
        price: { currency: WETH, amount: "0.2" },
        end_time: futureIso(1)
      }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("requests Base Seaport on-chain cancellation actions only for the matching active maker order", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.endsWith("/api/v2/orders/chain/base/protocol/" + SEAPORT + "/" + HASH)) {
      return new Response(JSON.stringify({ order: {
        chain: "base", status: "ACTIVE", order_hash: HASH, protocol_address: SEAPORT,
        asset: { contract: CONTRACT, identifier: "1" }, remaining_quantity: 1,
        protocol_data: { parameters: { offerer: "0x1111111111111111111111111111111111111111" } }
      } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.ok(target.endsWith("/api/v2/orders/chain/base/protocol/" + SEAPORT + "/" + HASH + "/cancel/actions"));
    assert.equal(JSON.parse(init.body).address, "0x1111111111111111111111111111111111111111");
    return new Response(JSON.stringify({ steps: [{ transaction: { chain: "base", to: SEAPORT, data: "0x12345678", value: "0" } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("cancel-actions", { address: "0x1111111111111111111111111111111111111111", order_hash: HASH, protocol_address: SEAPORT }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).steps.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("refuses cancellation when the connected wallet is not the OpenSea order maker", async () => {
  const originalFetch = globalThis.fetch;
  let cancellationRequested = false;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/cancel/actions")) cancellationRequested = true;
    return new Response(JSON.stringify({ order: {
      chain: "base", status: "ACTIVE", order_hash: HASH, protocol_address: SEAPORT,
      asset: { contract: CONTRACT, identifier: "1" }, remaining_quantity: 1,
      protocol_data: { parameters: { offerer: "0x2222222222222222222222222222222222222222" } }
    } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({
      request: request("cancel-actions", { address: "0x1111111111111111111111111111111111111111", order_hash: HASH, protocol_address: SEAPORT }),
      env: { OPENSEA_API_KEY: "test-key" }
    });
    assert.equal(response.status, 403);
    assert.equal(cancellationRequested, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects cancellation for a noncanonical protocol address", async () => {
  const response = await onRequest({
    request: request("cancel-actions", { address: "0x1111111111111111111111111111111111111111", order_hash: HASH, protocol_address: "0x3333333333333333333333333333333333333333" }),
    env: { OPENSEA_API_KEY: "test-key" }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /canonical Base Seaport/);
});

test("publishes a signed six-month Base listing through the current OpenSea v2 endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/orders/base/seaport/listings"));
    assert.equal(JSON.parse(init.body).protocol_address, SEAPORT);
    return new Response(JSON.stringify({ order_hash: HASH }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({ request: request("post-listing", signedOrderBody("listing", 6)), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order_hash, HASH);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects a signed listing longer than six months before posting", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const response = await onRequest({ request: request("post-listing", signedOrderBody("listing", 7)), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /within 6 month/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("publishes a signed Base WETH offer through the current OpenSea v2 endpoint", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/orders/base/seaport/offers"));
    assert.equal(JSON.parse(init.body).protocol_address, SEAPORT);
    return new Response(JSON.stringify({ order_hash: HASH }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await onRequest({ request: request("post-offer", signedOrderBody("offer", 1)), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).order_hash, HASH);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects a signed order whose payment differs from the displayed user amount", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const body = signedOrderBody("listing", 6);
    body.expected.amount = "0.1";
    const response = await onRequest({ request: request("post-listing", body), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /does not match the amount and currency/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects a signed order that adds consideration in an unexpected currency", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const body = signedOrderBody("listing", 6);
    body.parameters.consideration.push({ itemType: 1, token: WETH, identifierOrCriteria: "0", startAmount: "1", endAmount: "1", recipient: "0x1111111111111111111111111111111111111111" });
    const response = await onRequest({ request: request("post-listing", body), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unsupported or additional payment token/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects a listing that routes all payment away from the maker", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const body = signedOrderBody("listing", 6);
    body.parameters.consideration[0].recipient = "0x2222222222222222222222222222222222222222";
    const response = await onRequest({ request: request("post-listing", body), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /positive seller payout/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});


test("CryptoPunks [Base] collection listings use the configured OpenSea slug", async t => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async url => {
    requested = new URL(String(url));
    return new Response(JSON.stringify({listings: [], next: null}), {status: 200});
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const response = await onRequest({request: new Request("https://market.test/api/trade?action=collection-listings&contract=0x18d91b5597f1a7227d2960945c9a1417f0ff721d&limit=10"), env: {OPENSEA_API_KEY: "private-test-key"}});
  assert.equal(response.status, 200);
  assert.match(requested.pathname, /\/listings\/collection\/cryptopunks-base\/best$/);
});

function polygonSignedOrderBody(side = "listing", currency = side === "listing" ? "POL" : "WETH") {
  const body = signedOrderBody(side, side === "listing" ? 6 : 1);
  body.expected.currency = currency;
  const nft = side === "listing" ? body.parameters.offer[0] : body.parameters.consideration[0];
  nft.token = POLYGON_CONTRACT;
  if (side === "listing") {
    body.parameters.consideration[0].token = currency === "WETH" ? POLYGON_WETH : "0x0000000000000000000000000000000000000000";
    body.parameters.consideration[0].itemType = currency === "WETH" ? 1 : 0;
  } else {
    body.parameters.offer[0].token = POLYGON_WETH;
  }
  return body;
}

test("rejects Polygon listing actions because NodeMonkes Polygon is not listable", async () => {
  const response = await onRequest({ request: request("listing-actions", {
    address: "0x1111111111111111111111111111111111111111",
    items: [{ nft_id: "polygon/" + POLYGON_CONTRACT + "/1", quantity: 1, price: { currency: "MATIC", amount: "0.05" }, end_time: futureIso(6) }]
  }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /disabled for NodeMonkes Polygon/);
});

test("builds Polygon offer actions with Polygon chain, NFT id and canonical Polygon WETH", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith("/api/v2/offers/actions"));
    const payload = JSON.parse(init.body);
    assert.equal(payload.item.chain, "polygon");
    assert.equal(payload.item.nft_id, "polygon/" + POLYGON_CONTRACT + "/1");
    assert.equal(payload.price.currency, POLYGON_WETH);
    return new Response(JSON.stringify({ steps: [] }), { status: 200 });
  };
  try {
    const response = await onRequest({ request: request("offer-actions", {
      address: "0x1111111111111111111111111111111111111111",
      item: { chain: "polygon", contract: POLYGON_CONTRACT, token_id: "1" }, quantity: 1,
      price: { currency: POLYGON_WETH, amount: "0.2" }, end_time: futureIso(1)
    }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 200);
  } finally { globalThis.fetch = originalFetch; }
});

test("posts validated Polygon Seaport offers to the Polygon paths", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ order_hash: HASH }), { status: 200 });
  };
  try {
    const response = await onRequest({ request: request("post-offer", polygonSignedOrderBody("offer"), { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key", POLYGON_SEAPORT_ADDRESS: SEAPORT } });
    assert.equal(response.status, 200);
    assert.ok(seen[0].url.endsWith("/api/v2/orders/polygon/seaport/offers"));
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects Polygon orders signed for a different NFT/network, protocol or payment token", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  try {
    const wrongNft = polygonSignedOrderBody("listing");
    wrongNft.parameters.offer[0].token = CONTRACT;
    let response = await onRequest({ request: request("post-listing", wrongNft, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    const wrongProtocol = polygonSignedOrderBody("listing");
    wrongProtocol.protocol_address = "0x3333333333333333333333333333333333333333";
    response = await onRequest({ request: request("post-listing", wrongProtocol, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    const wrongPayment = polygonSignedOrderBody("listing", "WETH");
    wrongPayment.parameters.consideration[0].token = WETH;
    response = await onRequest({ request: request("post-listing", wrongPayment, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 400);
    const wrongChainOffer = await onRequest({ request: request("offer-actions", {
      address: "0x1111111111111111111111111111111111111111",
      item: { chain: "base", contract: POLYGON_CONTRACT, token_id: "1" }, quantity: 1,
      price: { currency: POLYGON_WETH, amount: "0.2" }, end_time: futureIso(1)
    }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(wrongChainOffer.status, 400);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects Polygon fulfillment for a Base-chain order and requests Polygon-native payment for Polygon listings", async () => {
  const originalFetch = globalThis.fetch;
  let paymentToken;
  globalThis.fetch = async (_url, init) => {
    paymentToken = JSON.parse(init.body).payment.token_address;
    return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
  };
  try {
    const wrongChain = await onRequest({ request: request("fulfill-listing", {
      fulfiller: { address: "0x1111111111111111111111111111111111111111" },
      listing: { order_hash: HASH, chain: "base", protocol_address: SEAPORT, asset: { contract: POLYGON_CONTRACT, identifier: "1" } }
    }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(wrongChain.status, 400);
    const correct = await onRequest({ request: request("fulfill-listing", {
      fulfiller: { address: "0x1111111111111111111111111111111111111111" },
      listing: { order_hash: HASH, chain: "polygon", protocol_address: SEAPORT, asset: { contract: POLYGON_CONTRACT, identifier: "1" } }
    }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(correct.status, 200);
    assert.equal(paymentToken, "0x0000000000000000000000000000000000000000");
  } finally { globalThis.fetch = originalFetch; }
});

test("does not invent an OpenSea collection slug for Polygon NodeMonkes reads", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error("must not fetch"); };
  try {
    for (const action of ["listings", "offers"]) {
      const response = await onRequest({ request: request(action, undefined, { method: "GET", contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.orders, []);
      assert.match(data.info, /No OpenSea collection slug/);
    }
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});


test("uses Polygon WETH for WETH listing fulfillment instead of native currency", async () => {
  const originalFetch = globalThis.fetch;
  let payload;
  globalThis.fetch = async (_url, init) => {
    payload = JSON.parse(init.body);
    return new Response(JSON.stringify({ transactions: [] }), { status: 200 });
  };
  try {
    const order = {
      order_hash: HASH, chain: "polygon", protocol_address: SEAPORT,
      asset: { contract: POLYGON_CONTRACT, identifier: "1" },
      protocol_data: { parameters: { consideration: [{ itemType: 1, token: POLYGON_WETH }] } }
    };
    const response = await onRequest({ request: request("fulfill-listing", {
      fulfiller: { address: "0x1111111111111111111111111111111111111111" }, listing: order
    }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
    assert.equal(response.status, 200);
    assert.equal(payload.payment.chain, "polygon");
    assert.equal(payload.payment.token_address, POLYGON_WETH);
  } finally { globalThis.fetch = originalFetch; }
});

test("rejects Polygon unlisting because NodeMonkes Polygon is not listable", async () => {
  const response = await onRequest({ request: request("cancel-actions", {
    address: "0x1111111111111111111111111111111111111111", order_hash: HASH, protocol_address: SEAPORT
  }, { contract: POLYGON_CONTRACT }), env: { OPENSEA_API_KEY: "test-key" } });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /disabled for NodeMonkes Polygon/);
});
