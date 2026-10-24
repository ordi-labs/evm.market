const ALLOWED = new Set(["0xb9110ba3266f4983193c0d5f55c792a94368af28","0x095b6ae2102094be8b5f06fac27275ddb9a8c70"]);
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=20, s-maxage=60","x-content-type-options":"nosniff","access-control-allow-origin":"*"}});
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const next = url.searchParams.get("next");
  if (next && (next.length > 2048 || !/^[A-Za-z0-9_=-]+$/.test(next))) return json({error:"Invalid pagination cursor."}, 400);
  // Cloudflare Pages secrets are configured per project; accept the user's established name.
  const openSeaKey = env.OPENSEA_API || env.OPENSEA_API_KEY;
  if (!openSeaKey) return json({error:"OpenSea API secret (OPENSEA_API) is not configured for this Pages environment."}, 503);
  const upstream = new URL("https://api.opensea.io/api/v2/chain/base/contract/" + contract + "/nfts");
  upstream.searchParams.set("limit", String(limit));
  if (next) upstream.searchParams.set("next", next);
  let response;
  try { response = await fetch(upstream, {headers:{"accept":"application/json","x-api-key":openSeaKey}}); }
  catch { return json({error:"OpenSea is temporarily unreachable. Please retry."}, 502); }
  if (!response.ok) return json({error:response.status === 429 ? "OpenSea rate limit reached. Please retry shortly." : "OpenSea API request failed.", upstreamStatus:response.status}, response.status === 429 ? 429 : 502);
  let data;
  try { data = await response.json(); } catch { return json({error:"OpenSea returned an invalid response."}, 502); }
  return json({nfts:Array.isArray(data.nfts)?data.nfts:[],next:typeof data.next==="string"?data.next:null,source:"opensea"});
}