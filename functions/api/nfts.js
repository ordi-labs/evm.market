const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const ALLOWED = new Set([PUNKS, NODEMONKES]);
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=20, s-maxage=60","x-content-type-options":"nosniff","access-control-allow-origin":"*"}});
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400);
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const next = url.searchParams.get("next");
  if (next && (next.length > 2048 || !/^[A-Za-z0-9_.~+/=-]+$/.test(next))) return json({error:"Invalid pagination cursor."}, 400);

  // NodeMonkes uses Alchemy NFT API on Base; Base Punks keeps its existing OpenSea path.
  if (contract === NODEMONKES) {
    // Accept a raw Alchemy key or an Alchemy endpoint URL stored in any established secret name.
    const configuredAlchemy = env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API;
    if (!configuredAlchemy) return json({error:"Alchemy API secret is missing. Configure ALCHEMY_API_KEY (or ALCHEMY_API / ETHEREUM_API) in Cloudflare Pages Production."}, 503);
    let alchemyKey = String(configuredAlchemy).trim();
    try {
      if (/^https?:\/\//i.test(alchemyKey)) {
        const parsed = new URL(alchemyKey);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const keyIndex = segments.findIndex(part => part === "v2" || part === "v3");
        if (keyIndex >= 0 && segments[keyIndex + 1]) alchemyKey = segments[keyIndex + 1];
        else return json({error:"ETHEREUM_API must contain an Alchemy API key or a supported Alchemy endpoint URL."}, 503);
      }
    } catch {
      return json({error:"Alchemy API configuration is not a valid key or endpoint URL."}, 503);
    }
    const upstream = new URL("https://base-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(alchemyKey) + "/getNFTsForContract");
    upstream.searchParams.set("contractAddress", contract);
    upstream.searchParams.set("withMetadata", "true");
    upstream.searchParams.set("limit", String(limit));
    if (next) upstream.searchParams.set("pageKey", next);
    let response;
    try { response = await fetch(upstream, {headers:{"accept":"application/json"}}); }
    catch { return json({error:"Alchemy is temporarily unreachable. Please retry."}, 502); }
    if (!response.ok) return json({error:response.status === 429 ? "Alchemy rate limit reached. Please retry shortly." : "Alchemy NFT API request failed.", upstreamStatus:response.status}, response.status === 429 ? 429 : 502);
    let data;
    try { data = await response.json(); } catch { return json({error:"Alchemy returned an invalid response."}, 502); }
    const nfts = Array.isArray(data.nfts) ? data.nfts.map(n => ({
      identifier: String(n.tokenId ?? ""),
      token_id: String(n.tokenId ?? ""),
      name: n.name || n.raw?.metadata?.name || "",
      description: n.description || n.raw?.metadata?.description || "",
      image_url: n.image?.cachedUrl || n.image?.thumbnailUrl || n.image?.originalUrl || n.raw?.metadata?.image || "",
      opensea_url: "https://og.rarible.com/collection/base/0x095b6ae2102094be8b5f06fac27275ddb9a8c70a/items"
    })) : [];
    return json({nfts, next:typeof data.pageKey === "string" ? data.pageKey : null, source:"alchemy"});
  }

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