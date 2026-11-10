import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {onRequestGet as getNfts} from "../functions/api/nfts.js";
import {onRequestGet as getNft} from "../functions/api/nft.js";
import {onRequestGet as getTraits} from "../functions/api/traits.js";
import {onRequestGet as getOwned} from "../functions/api/owned.js";
import {onRequest as trade} from "../functions/api/trade.js";

const COLLECTIONS = [
  {name: "Base Oddities", key: "baseoddities", contract: "0x8b245812b0755b7e0259395beca3e591734660fb", slug: "base-oddities"},
  {name: "Pixel Nomads", key: "pixelnomads", contract: "0x13ef1ea93602873d11a92bc434c8ed580487b2dc", slug: "pixel-nomads-783494962"},
  {name: "Neon Relics", key: "neonrelics", contract: "0x64d94e792076da8df31d06e15e7ab4e152999c06", slug: "neon-relics-567749795"}
];
const API_KEY = "private-test-key";
const WALLET = "0x1111111111111111111111111111111111111111";
const SEAPORT = "0x0000000000000068f116a894984e2db1123eb395";
function requestUrl(path, params = {}) { const url = new URL("https://market.test" + path); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value)); return url; }
function ownerResult(address) { return "0x" + "0".repeat(24) + address.slice(2).toLowerCase(); }
function futureIso(months) { const d = new Date(); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString(); }
function signedListingBody(contract) {
  const now = Math.floor(Date.now() / 1000);
  return {expected: {amount: "0.05", currency: "ETH"}, parameters: {offerer: WALLET,
    offer: [{itemType: 2, token: contract, identifierOrCriteria: "1", startAmount: "1", endAmount: "1"}],
    consideration: [{itemType: 0, token: "0x0000000000000000000000000000000000000000", identifierOrCriteria: "0", startAmount: "50000000000000000", endAmount: "50000000000000000", recipient: WALLET}],
    startTime: String(now), endTime: String(Math.floor(Date.parse(futureIso(6)) / 1000))}, protocol_address: SEAPORT, signature: "0x" + "1".repeat(130)};
}

test("the home page selects verified Base collections and reflects the eight-collection supply", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const collection of COLLECTIONS) { assert.ok(html.includes(`data-collection="${collection.key}"`)); assert.ok(html.includes(`contract:"${collection.contract}",slug:"${collection.slug}",network:"base"`)); }
  assert.match(html, /80,000 ITEMS/); assert.match(html, /<strong>80,000<\/strong><span>Collection supply<\/span>/); assert.match(html, /<strong>08<\/strong><span>Curated collections<\/span>/);
});

test("both collections have OpenSea NFT feeds, global trait-scan pages, and exact trait filtering", async t => {
  const originalFetch = globalThis.fetch; let requested;
  globalThis.fetch = async url => { requested = new URL(String(url)); return new Response(JSON.stringify({nfts: [{identifier: "1", name: "Sample #1", traits: [{trait_type: "Background", value: "Arctic"}]}], next: null}), {status: 200}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const collection of COLLECTIONS.filter(c => c.key !== "neonrelics")) {
    const env = {OPENSEA_API_KEY: API_KEY};
    let response = await getNfts({request: new Request(requestUrl("/api/nfts", {contract: collection.contract, limit: 2})), env});
    assert.equal(response.status, 200, collection.name); assert.equal(requested.pathname, `/api/v2/chain/base/contract/${collection.contract}/nfts`); assert.equal((await response.json()).source, "opensea");
    response = await getNfts({request: new Request(requestUrl("/api/nfts", {contract: collection.contract, scanTraits: 1, limit: 50})), env});
    assert.equal(response.status, 200, collection.name + " trait scan"); assert.equal(requested.pathname, `/api/v2/chain/base/contract/${collection.contract}/nfts`); assert.equal((await response.json()).source, "opensea-trait-index");
    response = await getNfts({request: new Request(requestUrl("/api/nfts", {contract: collection.contract, traitType: "Background", traitValue: "Arctic"})), env});
    assert.equal(response.status, 200, collection.name + " exact trait filter"); assert.equal(requested.pathname, `/api/v2/collection/${collection.slug}/nfts`); assert.deepEqual(JSON.parse(requested.searchParams.get("traits")), [{traitType: "Background", value: "Arctic"}]); assert.equal((await response.json()).source, "opensea-traits");
  }
});

test("Neon Relics uses the OpenSea API for live data and keeps NFT actions inside evm.market", async t => {
  const originalFetch = globalThis.fetch; let requested;
  globalThis.fetch = async url => { requested = new URL(String(url)); return new Response(JSON.stringify({nfts: [{identifier: "1", name: "Neon Relics #1", traits: [{trait_type: "Aura", value: "Pulse Halo"}]}], next: null}), {status: 200}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  const contract = COLLECTIONS[2].contract;
  let response = await getNfts({request: new Request(requestUrl("/api/nfts", {contract, limit: 2})), env: {OPENSEA_API_KEY: API_KEY}});
  assert.equal(response.status, 200); assert.equal(requested.pathname, `/api/v2/chain/base/contract/${contract}/nfts`); assert.equal((await response.json()).source, "opensea");
  response = await getNfts({request: new Request(requestUrl("/api/nfts", {contract, scanTraits: 1, limit: 50})), env: {OPENSEA_API_KEY: API_KEY}});
  assert.equal(response.status, 200); assert.equal(requested.pathname, `/api/v2/chain/base/contract/${contract}/nfts`); assert.equal((await response.json()).source, "opensea-trait-index");
  response = await getNft({request: new Request(requestUrl("/api/nft", {contract, tokenId: 1})), env: {OPENSEA_API_KEY: API_KEY}});
  assert.equal(response.status, 200); assert.equal((await response.json()).marketplaceUrl, "/#market");
});

test("NFT detail and collection-trait routes use the matching OpenSea contract and slug", async t => {
  const originalFetch = globalThis.fetch; let requested;
  globalThis.fetch = async url => { requested = new URL(String(url)); return requested.pathname.startsWith("/api/v2/traits/") ? new Response(JSON.stringify({traits: {categories: {Background: "string"}}}), {status: 200}) : new Response(JSON.stringify({nft: {identifier: "1", name: "Sample #1", image_url: "https://images.test/1.png", traits: [{trait_type: "Background", value: "Arctic"}]}}), {status: 200}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const collection of COLLECTIONS.filter(c => c.key !== "neonrelics")) {
    let response = await getNft({request: new Request(requestUrl("/api/nft", {contract: collection.contract, tokenId: 1})), env: {OPENSEA_API_KEY: API_KEY}});
    assert.equal(response.status, 200, collection.name + " details"); assert.equal(requested.pathname, `/api/v2/chain/base/contract/${collection.contract}/nfts/1`); assert.equal((await response.json()).marketplaceUrl, `https://opensea.io/assets/base/${collection.contract}/1`);
    response = await getTraits({request: new Request(requestUrl("/api/traits", {contract: collection.contract})), env: {OPENSEA_API_KEY: API_KEY}});
    assert.equal(response.status, 200, collection.name + " facets"); assert.equal(requested.pathname, `/api/v2/traits/${collection.slug}`); assert.equal((await response.json()).collection, collection.slug);
  }
});

test("ownership checks accept both contracts and verify them on Base", async t => {
  const originalFetch = globalThis.fetch; let contractRequested = "";
  globalThis.fetch = async (input, init = {}) => { const url = new URL(String(input)); if (url.pathname.endsWith("/getNFTsForOwner")) { contractRequested = url.searchParams.get("contractAddresses[]"); return new Response(JSON.stringify({ownedNfts: [{contract: {address: contractRequested}, tokenId: "1", name: "Owned #1"}]}), {status: 200}); } const body = JSON.parse(init.body); if (body.method === "eth_chainId") return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: "0x2105"}), {status: 200}); return new Response(JSON.stringify({jsonrpc: "2.0", id: 1, result: ownerResult(WALLET)}), {status: 200}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const collection of COLLECTIONS) { const response = await getOwned({request: new Request(requestUrl("/api/owned", {contract: collection.contract, owner: WALLET})), env: {ALCHEMY_API_KEY: API_KEY, ETHEREUM_API: "https://base-rpc.test"}}); assert.equal(response.status, 200, collection.name); assert.equal(contractRequested, collection.contract); const body = await response.json(); assert.equal(body.source, "alchemy+base-ownerOf"); assert.equal(body.verifiedCount, 1); assert.equal(body.nfts[0].verifiedOwner, true); }
});

test("collection orderbooks and Base Seaport listings resolve each supplied OpenSea slug", async t => {
  const originalFetch = globalThis.fetch; let requested; let expectedContract = "";
  globalThis.fetch = async (url, init = {}) => { requested = new URL(String(url)); if (init.method === "POST") { const payload = JSON.parse(init.body); assert.equal(payload.protocol_address, SEAPORT); assert.equal(payload.parameters.offer[0].token, expectedContract); return new Response(JSON.stringify({order_hash: "0x" + "a".repeat(64)}), {status: 200}); } return new Response(JSON.stringify({listings: [], next: null}), {status: 200}); };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const collection of COLLECTIONS.filter(c => c.key !== "neonrelics")) {
    const listingUrl = requestUrl("/api/trade", {action: "collection-listings", contract: collection.contract, limit: 10});
    let response = await trade({request: new Request(listingUrl), env: {OPENSEA_API_KEY: API_KEY}}); assert.equal(response.status, 200, collection.name + " orderbook"); assert.equal(requested.pathname, `/api/v2/listings/collection/${collection.slug}/best`);
    expectedContract = collection.contract; const postUrl = requestUrl("/api/trade", {action: "post-listing", contract: collection.contract, tokenId: 1});
    response = await trade({request: new Request(postUrl, {method: "POST", headers: {origin: "https://market.test", "content-type": "application/json"}, body: JSON.stringify(signedListingBody(collection.contract))}), env: {OPENSEA_API_KEY: API_KEY}});
    assert.equal(response.status, 200, collection.name + " Base Seaport listing"); assert.equal(requested.pathname, "/api/v2/orders/base/seaport/listings");
  }
});
