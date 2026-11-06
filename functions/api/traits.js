const COLLECTIONS = new Map([
  ["0xb9110ba3266f4983193c0d5f55c792a94368af28", "base-punks"],
  ["0x095b6ae2102094be8b5f06fac27275ddb9a8c70a", "nodemonkes"],
  ["0x7325654c657520e30c56a04225a3d9acdf895e55", "bytebeasts-base"]
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
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = String(url.searchParams.get("contract") || "").toLowerCase();
  const slug = COLLECTIONS.get(contract);
  if (!slug) return json({error: "Unsupported collection contract."}, 400);
  const apiKey = String(env.OPENSEA_API_KEY || env.OPENSEA_API || "").trim();
  if (!apiKey) return json({error: "OpenSea API is not configured on the server."}, 503);
  try {
    const response = await fetch(API + "/traits/" + encodeURIComponent(slug), {
      headers: {accept: "application/json", "x-api-key": apiKey}
    });
    const body = await response.text();
    let data;
    try { data = body ? JSON.parse(body) : {}; }
    catch { return json({error: "OpenSea returned invalid trait data."}, 502); }
    if (!response.ok) return json({
      error: response.status === 429 ? "OpenSea rate limit reached; retry shortly." : "OpenSea traits are temporarily unavailable.",
      providerStatus: response.status,
      retryAfter: response.headers.get("retry-after") || null
    }, response.status === 429 ? 429 : 502, response.status === 429 && response.headers.get("retry-after")
      ? {"retry-after": response.headers.get("retry-after")} : {});
    return json({collection: slug, traits: data.traits ?? data, source: "opensea"});
  } catch {
    return json({error: "Could not reach OpenSea traits API."}, 502);
  }
}
