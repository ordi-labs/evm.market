const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const ALLOWED = new Set([PUNKS, NODEMONKES]);
const OPENSEA_API = "https://api.opensea.io/api/v2";
const CHAIN = "base";
const PROTOCOL = "seaport";

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

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients are still constrained by validation and API credentials.
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

function findAssetItem(items, contract, tokenId) {
  if (!Array.isArray(items)) return false;
  return items.some(item => {
    const address = String(item?.token || item?.tokenAddress || item?.token_address || "").toLowerCase();
    const id = String(item?.identifierOrCriteria ?? item?.identifier_or_criteria ?? item?.tokenId ?? item?.token_id ?? "");
    return address === contract && id === tokenId;
  });
}

function validateSignedOrder(body, contract, tokenId, side) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A signed order object is required.");
  const parameters = body.parameters;
  const signature = body.signature;
  const protocolAddress = String(body.protocol_address || body.protocolAddress || "").toLowerCase();
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Order parameters are required.");
  if (!/^0x[0-9a-f]{128}(?:[0-9a-f]{2})?$/i.test(String(signature || ""))) throw new Error("A 64- or 65-byte order signature is required.");
  if (!/^0x[0-9a-f]{40}$/i.test(protocolAddress)) throw new Error("A valid Seaport protocol address is required.");
  const nftItems = side === "listing" ? parameters.offer : parameters.consideration;
  if (!findAssetItem(nftItems, contract, tokenId)) throw new Error("The signed order does not include the requested allowlisted NFT and token ID on the expected side.");
  const counterItems = side === "listing" ? parameters.consideration : parameters.offer;
  if (!Array.isArray(counterItems) || counterItems.length === 0) throw new Error("Order consideration/payment items are required.");
  if (!/^0x[0-9a-f]{40}$/i.test(String(parameters.offerer || ""))) throw new Error("Order offerer address is invalid.");
  return { parameters, signature, protocol_address: protocolAddress };
}

async function openSeaFetch(path, env, init = {}) {
  const apiKey = String(env.OPENSEA_API || env.OPENSEA_API_KEY || "").trim();
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
    // Do not reflect provider headers or credentials to the browser.
    return json({ error: "OpenSea request failed.", providerStatus: response.status, details: data?.errors || data?.detail || data?.message || null }, response.status === 429 ? 429 : 502);
  }
  return json(data);
}

export async function onRequest({ request, env }) {
  if (!sameOrigin(request)) return json({ error: "Cross-origin request denied." }, 403);
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, { allow: "GET, POST" });
  }
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || (request.method === "POST" ? "post-listing" : "listings");
  let asset;
  try {
    asset = getAssetParams(url);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  if (request.method === "GET") {
    if (action !== "listings" && action !== "offers") return json({ error: "Unsupported read action." }, 400);
    const params = new URLSearchParams({
      asset_contract_address: asset.contract,
      token_ids: asset.tokenId,
      limit: "10"
    });
    return openSeaFetch("/orders/" + CHAIN + "/" + PROTOCOL + "/" + action + "?" + params.toString(), env);
  }

  if (action !== "post-listing" && action !== "post-offer") return json({ error: "Unsupported write action." }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Request body must be valid JSON." }, 400); }
  let order;
  try {
    order = validateSignedOrder(body, asset.contract, asset.tokenId, action === "post-listing" ? "listing" : "offer");
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  // The browser must create and sign the Seaport order with the user's wallet.
  // This endpoint never accepts private keys and never signs or submits a blockchain transaction.
  return openSeaFetch("/orders/" + CHAIN + "/" + PROTOCOL + "/" + (action === "post-listing" ? "listings" : "offers"), env, {
    method: "POST",
    body: JSON.stringify(order)
  });
}
