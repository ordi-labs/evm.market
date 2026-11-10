const NODEMONKES_POLYGON = "0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
const COLLECTIONS = new Map([
  ["0xb9110ba3266f4983193c0d5f55c792a94368af28", "punks-base-1"],
  ["0x095b6ae2102094be8b5f06fac27275ddb9a8c70a", "nodemonkes"],
  ["0x7325654c657520e30c56a04225a3d9acdf895e55", "bytebeasts-base"],
  ["0x64d94e792076da8df31d06e15e7ab4e152999c06", "neon-relics-567749795"],
  ["0x8b245812b0755b7e0259395beca3e591734660fb", "base-oddities"],
  ["0x13ef1ea93602873d11a92bc434c8ed580487b2dc", "pixel-nomads-783494962"],
  ["0x18d91b5597f1a7227d2960945c9a1417f0ff721d", "cryptopunks-base"]
]);
const API = "https://api.opensea.io/api/v2";
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=60, s-maxage=300" : "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    ...headers
  }});
}
function errorResponse(response, data) {
  const retryAfter = response.headers.get("retry-after");
  return json({
    error: response.status === 429 ? "OpenSea rate limit reached; retry shortly." : "OpenSea traits are temporarily unavailable.",
    providerStatus: response.status,
    retryAfter,
    details: data?.errors || data?.detail || data?.message || null
  }, response.status === 429 ? 429 : 502, response.status === 429 && retryAfter ? {"retry-after": retryAfter} : {});
}
async function parseResponse(response) {
  const body = await response.text();
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new Error("OpenSea returned invalid JSON."); }
}
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = String(url.searchParams.get("contract") || "").toLowerCase();
  if (contract === NODEMONKES_POLYGON) {
    return url.searchParams.has("tokenIds")
      ? json({collection:"NodeMonkes [Polygon]",nftTraits:{},source:"alchemy-local-index"})
      : json({collection:"NodeMonkes [Polygon]",traits:[],source:"alchemy-local-index"});
  }
  const slug = COLLECTIONS.get(contract);
  if (!slug) return json({error: "Unsupported collection contract."}, 400);
  const tokenIdsParam = url.searchParams.get("tokenIds");
  const apiKey = String(env.OPENSEA_API_KEY || env.OPENSEA_API || "").trim();
  if (!apiKey) return json({error: "OpenSea API is not configured on the server."}, 503);
  try {
    if (tokenIdsParam !== null) {
      const tokenIds = [...new Set(tokenIdsParam.split(",").map(id => id.trim()))];
      if (!tokenIds.length || tokenIds.length > 50 || tokenIds.some(id => !/^(0|[1-9][0-9]{0,77})$/.test(id))) {
        return json({error: "Provide 1 to 50 valid numeric token IDs."}, 400);
      }
      const response = await fetch(API + "/nfts/batch", {
        method: "POST",
        headers: {accept: "application/json", "content-type": "application/json", "x-api-key": apiKey},
        body: JSON.stringify({identifiers: tokenIds.map(token_id => ({chain: "base", contract_address: contract, token_id}))})
      });
      const data = await parseResponse(response);
      if (!response.ok) return errorResponse(response, data);
      const nftTraits = {};
      for (const nft of Array.isArray(data?.nfts) ? data.nfts : []) {
        const id = String(nft?.identifier ?? "");
        if (!tokenIds.includes(id)) continue;
        nftTraits[id] = (Array.isArray(nft.traits) ? nft.traits : []).flatMap(trait => {
          const type = String(trait?.trait_type ?? trait?.traitType ?? trait?.type ?? trait?.key ?? trait?.name ?? "").trim();
          if (!type || trait?.value === undefined || trait?.value === null) return [];
          return [{trait_type: type, value: String(trait.value), ...(trait.display_type ? {display_type: trait.display_type} : {})}];
        });
      }
      return json({collection: slug, nftTraits, source: "opensea-batch"});
    }
    const response = await fetch(API + "/traits/" + encodeURIComponent(slug), {
      headers: {accept: "application/json", "x-api-key": apiKey}
    });
    const data = await parseResponse(response);
    if (!response.ok) return errorResponse(response, data);
    return json({collection: slug, traits: data?.traits ?? data, source: "opensea"});
  } catch (error) {
    return json({error: error?.message === "OpenSea returned invalid JSON." ? error.message : "Could not reach OpenSea traits API."}, 502);
  }
}
