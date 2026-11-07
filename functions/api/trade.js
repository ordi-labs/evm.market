const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const BYTEBEASTS = "0x7325654c657520e30c56a04225a3d9acdf895e55";
const CRYPTOPUNKS_BASE = "0x18d91b5597f1a7227d2960945c9a1417f0ff721d";
const ALLOWED = new Set([PUNKS, NODEMONKES, BYTEBEASTS, CRYPTOPUNKS_BASE]);
const COLLECTION_SLUGS = new Map([
  [PUNKS, "base-punks"],
  [NODEMONKES, "nodemonkes"],
  [BYTEBEASTS, "bytebeasts-base"],
  [CRYPTOPUNKS_BASE, "cryptopunks-base"]
]);
const OPENSEA_API = "https://api.opensea.io/api/v2";
const CHAIN = "base";
const PROTOCOL = "seaport";
const BASE_SEAPORT = "0x0000000000000068f116a894984e2db1123eb395";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const NATIVE_CURRENCY = "0x0000000000000000000000000000000000000000";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      ...extraHeaders
    }
  });
}

function sameOrigin(request, requireOrigin = false) {
  const origin = request.headers.get("origin");
  if (!origin) return !requireOrigin;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function getAssetParams(url) {
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  const tokenId = (url.searchParams.get("tokenId") || "").trim();
  if (!ALLOWED.has(contract)) throw new Error("Unsupported collection contract.");
  if (!/^(0|[1-9][0-9]{0,77})$/.test(tokenId)) throw new Error("A valid numeric tokenId is required.");
  return { contract, tokenId };
}

function expectedSeaportAddress(env) {
  const configured = String(env.BASE_SEAPORT_ADDRESS || BASE_SEAPORT).trim().toLowerCase();
  if (configured !== BASE_SEAPORT.toLowerCase()) {
    throw new Error("Configured Seaport address does not match the canonical Base Seaport 1.6 deployment.");
  }
  return BASE_SEAPORT.toLowerCase();
}

function addUtcMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function validateEndTime(value, maxMonths, label) {
  const end = Date.parse(String(value || ""));
  const now = Date.now();
  const maximum = addUtcMonths(new Date(now), maxMonths).getTime() + 60_000;
  if (!Number.isFinite(end) || end <= now + 60_000) throw new Error(label + " end_time must be a valid future ISO 8601 date.");
  if (end > maximum) throw new Error(label + " end_time cannot be more than " + maxMonths + " month(s) from now.");
  return new Date(end).toISOString();
}

function validateOrderExpiration(parameters, side) {
  const seconds = Number(parameters.endTime ?? parameters.end_time);
  const start = Number(parameters.startTime ?? parameters.start_time);
  const maxMonths = side === "listing" ? 6 : 1;
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(start) || start <= 0 || start > now + 60) {
    throw new Error("The signed order must include a valid start time.");
  }
  const max = Math.floor(addUtcMonths(new Date(start * 1000), maxMonths).getTime() / 1000) + 60;
  if (!Number.isSafeInteger(seconds) || seconds <= now + 60 || seconds <= start || seconds > max) {
    throw new Error("The signed order must expire in the future and within " + maxMonths + " month(s) of its start time.");
  }
}

function decimalAmountToUnits(value) {
  const amount = String(value ?? "").trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error("Expected order amount must be positive with up to 18 decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0") || "0");
}

function findAssetItem(items, contract, tokenId) {
  if (!Array.isArray(items)) return false;
  return items.some(item => {
    const address = String(item?.token || item?.tokenAddress || item?.token_address || "").toLowerCase();
    const id = String(item?.identifierOrCriteria ?? item?.identifier_or_criteria ?? item?.tokenId ?? item?.token_id ?? "");
    return address === contract && id === tokenId;
  });
}

function validateSignedOrder(body, contract, tokenId, side, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A signed order object is required.");
  const parameters = body.parameters;
  const signature = body.signature;
  const protocolAddress = String(body.protocol_address || body.protocolAddress || "").toLowerCase();
  const expectedProtocol = expectedSeaportAddress(env);
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Order parameters are required.");
  if (!/^0x[0-9a-f]{128}(?:[0-9a-f]{2})?$/i.test(String(signature || ""))) throw new Error("A 64- or 65-byte order signature is required.");
  if (!/^0x[0-9a-f]{40}$/i.test(protocolAddress) || protocolAddress !== expectedProtocol) throw new Error("Order protocol address does not match the configured Base Seaport contract.");
  const nftItems = side === "listing" ? parameters.offer : parameters.consideration;
  const matchingNfts = Array.isArray(nftItems) ? nftItems.filter(item => String(item?.token || "").toLowerCase() === contract && String(item?.identifierOrCriteria ?? "") === tokenId) : [];
  if (matchingNfts.length !== 1) throw new Error("The signed order must include exactly the requested allowlisted NFT and token ID on the expected side.");
  const nftItem = matchingNfts[0];
  if (Number(nftItem.itemType) !== 2 || String(nftItem.startAmount) !== "1" || String(nftItem.endAmount) !== "1") throw new Error("Only a single ERC-721 NFT order is supported.");
  const counterItems = side === "listing" ? parameters.consideration : parameters.offer;
  if (!Array.isArray(counterItems) || counterItems.length === 0) throw new Error("Order consideration/payment items are required.");
  const expected = body.expected;
  const expectedCurrency = String(expected?.currency || "").trim().toUpperCase();
  if (side === "offer" && expectedCurrency !== "WETH") throw new Error("Offers are restricted to WETH on Base.");
  if (side === "listing" && !["ETH", "WETH"].includes(expectedCurrency)) throw new Error("Listings are restricted to ETH or WETH on Base.");
  const expectedAmount = decimalAmountToUnits(expected?.amount);
  const offerer = String(parameters.offerer || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/i.test(offerer)) throw new Error("Order offerer address is invalid.");
  const expectedToken = expectedCurrency === "ETH" ? NATIVE_CURRENCY.toLowerCase() : BASE_WETH.toLowerCase();
  const expectedItemType = expectedCurrency === "ETH" ? 0 : 1;
  let startTotal = 0n;
  let endTotal = 0n;
  let sellerTotal = 0n;
  for (const item of counterItems) {
    if (Number(item?.itemType) !== expectedItemType || String(item?.token || "").toLowerCase() !== expectedToken) throw new Error("The signed order contains an unsupported or additional payment token.");
    const startAmount = String(item?.startAmount ?? "");
    const endAmount = String(item?.endAmount ?? "");
    if (!/^\d+$/.test(startAmount) || !/^\d+$/.test(endAmount) || BigInt(startAmount) <= 0n || BigInt(endAmount) <= 0n) throw new Error("The signed order contains an invalid payment amount.");
    if (side === "listing") {
      const recipient = String(item?.recipient || "").toLowerCase();
      if (!/^0x[0-9a-f]{40}$/i.test(recipient) || recipient === NATIVE_CURRENCY.toLowerCase()) throw new Error("Listing payment recipient is invalid.");
      if (startAmount !== endAmount) throw new Error("Variable-price listing payouts are not supported.");
      if (recipient === offerer) sellerTotal += BigInt(startAmount);
    }
    startTotal += BigInt(startAmount);
    endTotal += BigInt(endAmount);
  }
  if (startTotal !== expectedAmount || endTotal !== expectedAmount) throw new Error("The signed order payment does not match the amount and currency shown to the user.");
  if (side === "listing" && sellerTotal <= 0n) throw new Error("The listing must direct a positive seller payout to the connected maker.");
  validateOrderExpiration(parameters, side);
  return { parameters, protocol_address: protocolAddress, signature };
}

async function openSeaFetch(path, env, init = {}) {
  const apiKey = String(env.OPENSEA_API_KEY || env.OPENSEA_API || "").trim();
  if (!apiKey) return json({ error: "OpenSea API is not configured on the server." }, 503);
  const response = await fetch(OPENSEA_API + path, {
    ...init,
    headers: {
      "accept": "application/json",
      "x-api-key": apiKey,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {})
    }
  });
  const body = await response.text();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch { data = { error: "Invalid response from marketplace provider." }; }
  if (!response.ok) {
    return json({ error: "OpenSea request failed.", providerStatus: response.status, details: data?.errors || data?.detail || data?.message || null }, response.status === 429 ? 429 : 502);
  }
  return json(data);
}


function validateFulfillmentRequest(body, asset, side, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A fulfillment request object is required.");
  const fulfiller = body.fulfiller;
  const address = String(fulfiller?.address || "").trim();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("A valid connected wallet address is required.");
  const order = body[side];
  if (!order || typeof order !== "object" || Array.isArray(order)) throw new Error("The selected order is required.");
  const hash = String(order.order_hash || order.hash || "").trim();
  if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("A valid Seaport order hash is required.");
  const protocolAddress = String(order.protocol_address || "").toLowerCase();
  const expectedProtocol = expectedSeaportAddress(env);
  if (protocolAddress !== expectedProtocol) throw new Error("Order protocol address does not match the configured Base Seaport contract.");
  const chain = String(order.chain || "").toLowerCase();
  if (chain !== "base") throw new Error("Only Base mainnet orders are supported.");
  const orderAsset = order.asset;
  if (!orderAsset || String(orderAsset.contract || "").toLowerCase() !== asset.contract || String(orderAsset.identifier ?? "") !== asset.tokenId) {
    throw new Error("The order must match the requested allowlisted NFT and token ID.");
  }
  return {
    // OpenSea fulfillment_data expects "hash" on the order, not "order_hash".
    // Include the NFT consideration explicitly so the API can resolve its contract
    // and token ID rather than returning "Missing required field 'contract'".
    fulfiller: { address },
    [side]: { hash, chain: CHAIN, protocol_address: protocolAddress },
    consideration: {
      asset_contract_address: asset.contract,
      token_id: asset.tokenId
    },
    include_optional_creator_fees: body.include_optional_creator_fees === true,
    ...(side === "listing" && body.recipient && /^0x[0-9a-f]{40}$/i.test(String(body.recipient)) ? { recipient: String(body.recipient) } : {})
  };
}


function validateListingActionsRequest(body, asset) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A listing request object is required.");
  const address = String(body.address || "").trim();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("A valid connected seller wallet address is required.");
  if (!Array.isArray(body.items) || body.items.length !== 1) throw new Error("Exactly one NFT listing item is supported.");
  const item = body.items[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("A listing item is required.");
  const nftId = String(item.nft_id || item.nftId || "").trim();
  const expectedNftId = "base/" + asset.contract + "/" + asset.tokenId;
  if (nftId.toLowerCase() !== expectedNftId.toLowerCase()) throw new Error("The listing item must match the requested allowlisted Base NFT and token ID.");
  if (item.quantity !== 1) throw new Error("Only a quantity of one NFT is supported.");
  const price = item.price;
  if (!price || typeof price !== "object" || Array.isArray(price)) throw new Error("A positive listing price is required.");
  const currency = String(price.currency || "").trim().toUpperCase();
  const amount = String(price.amount ?? "").trim();
  if (!/^(ETH|WETH)$/.test(currency)) throw new Error("Only Base ETH or WETH listing currency is currently supported.");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error("Listing price must be a positive decimal amount with up to 18 decimal places.");
  const endTime = validateEndTime(item.end_time, 6, "Listing");
  return {
    address,
    items: [{
      chain: CHAIN,
      contract: asset.contract,
      token_id: asset.tokenId,
      end_time: endTime,
      quantity: 1,
      // OpenSea expects the payment-token contract; zero address denotes Base ETH.
      price: { currency: currency === "ETH" ? NATIVE_CURRENCY : BASE_WETH, amount }
    }],
    use_creator_fee: body.use_creator_fee !== false,
    ...(body.taker && /^0x[0-9a-f]{40}$/i.test(String(body.taker)) ? { taker: String(body.taker) } : {})
  };
}

function validateOfferActionsRequest(body, asset) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("An offer request object is required.");
  const address = String(body.address || "").trim();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("A valid connected bidder wallet address is required.");
  if (body.quantity !== 1) throw new Error("Only an offer for one NFT is supported.");
  const item = body.item;
  if (!item || String(item.chain || "").toLowerCase() !== CHAIN || String(item.contract || "").toLowerCase() !== asset.contract || String(item.token_id ?? "") !== asset.tokenId) {
    throw new Error("The offer item must match the requested allowlisted Base NFT and token ID.");
  }
  const price = body.price;
  if (!price || typeof price !== "object" || Array.isArray(price)) throw new Error("A positive offer price is required.");
  const currency = String(price.currency || "").trim().toLowerCase();
  if (currency !== BASE_WETH.toLowerCase()) throw new Error("Offers currently require canonical WETH on Base.");
  const amount = String(price.amount ?? "").trim();
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(amount) || !/[1-9]/.test(amount)) throw new Error("Offer amount must be positive with up to 18 decimal places.");
  const endTime = validateEndTime(body.end_time, 1, "Offer");
  return { address, item: { chain: CHAIN, contract: asset.contract, token_id: asset.tokenId }, quantity: 1, price: { currency: BASE_WETH, amount }, end_time: endTime, use_creator_fee: false };
}

function validateCancellationRequest(body, env) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A cancellation request object is required.");
  const address = String(body.address || "").trim();
  const orderHash = String(body.order_hash || body.orderHash || "").trim();
  const protocolAddress = String(body.protocol_address || body.protocolAddress || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error("A valid connected order-maker wallet is required.");
  if (!/^0x[0-9a-f]{64}$/i.test(orderHash)) throw new Error("A valid OpenSea order hash is required.");
  if (protocolAddress !== expectedSeaportAddress(env)) throw new Error("Only the canonical Base Seaport 1.6 protocol can be cancelled here.");
  return { address, orderHash, protocolAddress };
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
  }
  if (!sameOrigin(request, request.method === "POST")) return json({ error: "Same-origin request required." }, 403);


  const url = new URL(request.url);
  const action = url.searchParams.get("action") || (request.method === "POST" ? "post-listing" : "listings");
  if (request.method === "GET" && action === "collection-listings") {
    const contract = String(url.searchParams.get("contract") || "").toLowerCase();
    const slug = COLLECTION_SLUGS.get(contract);
    if (!slug) return json({ error: "Unsupported collection contract." }, 400);
    const limitRaw = url.searchParams.get("limit") || "200";
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return json({ error: "Listing page limit must be between 1 and 200." }, 400);
    const next = String(url.searchParams.get("next") || "");
    if (next.length > 2000) return json({ error: "Listing pagination cursor is too long." }, 400);
    const apiKey = String(env.OPENSEA_API_KEY || env.OPENSEA_API || "").trim();
    if (!apiKey) return json({ error: "OpenSea API is not configured on the server." }, 503);
    const endpoint = "/listings/collection/" + encodeURIComponent(slug) + "/best?limit=" + limit + (next ? "&next=" + encodeURIComponent(next) : "");
    let response;
    try { response = await fetch(OPENSEA_API + endpoint, {headers: {accept: "application/json", "x-api-key": apiKey}}); }
    catch { return json({ error: "OpenSea request failed." }, 502); }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { return json({ error: "Invalid response from marketplace provider." }, 502); }
    if (response.status === 404) return json({ listings: [], next: null });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      return json({ error: "OpenSea request failed.", providerStatus: response.status, retryAfter,
        details: data?.errors || data?.detail || data?.message || null }, response.status === 429 ? 429 : 502,
      response.status === 429 && retryAfter ? {"retry-after": retryAfter} : {});
    }
    return json(data);
  }
  let asset;
  try {
    asset = getAssetParams(url);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  if (request.method === "POST" && (action === "fulfill-listing" || action === "fulfill-offer")) {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    const side = action === "fulfill-listing" ? "listing" : "offer";
    let fulfillmentRequest;
    try { fulfillmentRequest = validateFulfillmentRequest(body, asset, side, env); }
    catch (error) { return json({ error: error.message }, 400); }
    // This returns transaction calldata only. The browser must show the transaction
    // summary and ask the connected wallet to sign/send it; this Worker never signs.
    if (side === "listing") {
      // The same-chain endpoint returns a decoded Seaport struct with input_data.
      // Use the cross-chain endpoint even for Base/ETH so the browser receives
      // ready-to-send hex calldata and never has to ABI-encode a fulfillment.
      const listing = fulfillmentRequest.listing;
      return openSeaFetch("/listings/cross_chain_fulfillment_data", env, {
        method: "POST",
        body: JSON.stringify({
          listings: [{
            hash: listing.hash,
            chain: CHAIN,
            protocol_address: listing.protocol_address
          }],
          fulfiller: fulfillmentRequest.fulfiller,
          payment: { chain: CHAIN, token_address: NATIVE_CURRENCY }
        })
      });
    }
    return openSeaFetch("/offers/fulfillment_data", env, {
      method: "POST",
      body: JSON.stringify(fulfillmentRequest)
    });
  }


  if (request.method === "POST" && action === "offer-actions") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    let offerRequest;
    try { offerRequest = validateOfferActionsRequest(body, asset); }
    catch (error) { return json({ error: error.message }, 400); }
    return openSeaFetch("/offers/actions", env, { method: "POST", body: JSON.stringify(offerRequest) });
  }

  if (request.method === "POST" && action === "cancel-actions") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    let cancellation;
    try { cancellation = validateCancellationRequest(body, env); }
    catch (error) { return json({ error: error.message }, 400); }
    const orderPath = "/orders/chain/" + CHAIN + "/protocol/" + cancellation.protocolAddress + "/" + cancellation.orderHash;
    const orderResponse = await openSeaFetch(orderPath, env);
    if (!orderResponse.ok) return orderResponse;
    let orderPayload;
    try { orderPayload = await orderResponse.json(); } catch { return json({ error: "OpenSea returned invalid order data." }, 502); }
    const order = orderPayload?.order || orderPayload;
    const orderAsset = order?.asset;
    const maker = String(order?.protocol_data?.parameters?.offerer || order?.protocolData?.parameters?.offerer || "").toLowerCase();
    if (String(order?.order_hash || "").toLowerCase() !== cancellation.orderHash.toLowerCase() || String(order?.chain || "").toLowerCase() !== CHAIN || String(order?.protocol_address || "").toLowerCase() !== cancellation.protocolAddress || String(orderAsset?.contract || "").toLowerCase() !== asset.contract || String(orderAsset?.identifier ?? "") !== asset.tokenId) {
      return json({ error: "The OpenSea order does not match this Base NFT and protocol." }, 400);
    }
    if (maker !== cancellation.address.toLowerCase()) return json({ error: "Only the connected maker may cancel this OpenSea order." }, 403);
    if (String(order?.status || "").toUpperCase() !== "ACTIVE" || Number(order?.remaining_quantity ?? 0) <= 0) return json({ error: "This OpenSea order is not active and cannot be cancelled here." }, 409);
    const path = orderPath + "/cancel/actions";
    return openSeaFetch(path, env, { method: "POST", body: JSON.stringify({ address: cancellation.address }) });
  }

  if (request.method === "POST" && action === "listing-actions") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
    let listingRequest;
    try { listingRequest = validateListingActionsRequest(body, asset); }
    catch (error) { return json({ error: error.message }, 400); }
    // OpenSea returns the ordered approval/signing steps. The client must display
    // each transaction and obtain explicit wallet confirmation; this endpoint never signs.
    return openSeaFetch("/listings/actions", env, {
      method: "POST",
      body: JSON.stringify(listingRequest)
    });
  }

  if (request.method === "GET") {
    if (action !== "listings" && action !== "offers") return json({ error: "Unsupported read action." }, 400);
    // OpenSea removed GET /orders/{chain}/{protocol}/listings and /offers in May 2026.
    // Use the supported best-order-by-NFT endpoints and preserve the response shape
    // expected by the browser. A 404 means no best order exists for this NFT.
    const slug = COLLECTION_SLUGS.get(asset.contract);
    const endpoint = "/" + action + "/collection/" + slug + "/nfts/" + encodeURIComponent(asset.tokenId) + "/best";
    const apiKey = String(env.OPENSEA_API_KEY || env.OPENSEA_API || "").trim();
    if (!apiKey) return json({ error: "OpenSea API is not configured on the server." }, 503);
    let response;
    try {
      response = await fetch(OPENSEA_API + endpoint, {
        headers: { accept: "application/json", "x-api-key": apiKey }
      });
    } catch {
      return json({ error: "OpenSea request failed." }, 502);
    }
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {
      return json({ error: "Invalid response from marketplace provider." }, 502);
    }
    if (response.status === 404) {
      return json(action === "listings" ? { orders: [], listings: [] } : { orders: [], offers: [] });
    }
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      return json({ error: "OpenSea request failed.", providerStatus: response.status,
        retryAfter,
        details: data?.errors || data?.detail || data?.message || null }, response.status === 429 ? 429 : 502,
      response.status === 429 && retryAfter ? {"retry-after": retryAfter} : {});
    }
    const order = data?.order && typeof data.order === "object" ? data.order : data && typeof data === "object" ? data : null;
    const identity = order?.asset || order?.nft || order?.item || null;
    const orderContract = identity?.contract || identity?.contract_address || identity?.address;
    const orderTokenId = identity?.identifier ?? identity?.token_id ?? identity?.tokenId;
    const hasIdentity = Boolean(orderContract || orderTokenId);
    const isMatchingAsset = !hasIdentity || (String(orderContract || "").toLowerCase() === asset.contract &&
      String(orderTokenId ?? "") === asset.tokenId);
    const supported = isMatchingAsset && String(order?.status || "ACTIVE").toUpperCase() === "ACTIVE" &&
      Boolean(order?.order_hash || order?.orderHash || order?.protocol_data?.order_hash);
    const orders = supported ? [order] : [];
    return json(action === "listings" ? { ...data, orders, listings: orders } : { ...data, orders, offers: orders });
  }

  if (action !== "post-listing" && action !== "post-offer") return json({ error: "Unsupported write action." }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  let order;
  try {
    order = validateSignedOrder(body, asset.contract, asset.tokenId, action === "post-listing" ? "listing" : "offer", env);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  // The user's wallet must create and sign the order. This API never receives private keys
  // and never signs or submits a blockchain transaction.
  return openSeaFetch("/orders/" + CHAIN + "/" + PROTOCOL + "/" + (action === "post-listing" ? "listings" : "offers"), env, {
    method: "POST",
    body: JSON.stringify(order)
  });
}
