const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const ALLOWED = new Set([PUNKS, NODEMONKES]);

const json = (data, status = 200, forceRefresh = false) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*"
  };
  if (forceRefresh) {
    headers["cache-control"] = "no-store, no-cache, must-revalidate, max-age=0";
    headers["pragma"] = "no-cache";
    headers["expires"] = "0";
  } else {
    headers["cache-control"] = "public, max-age=20, s-maxage=60";
  }
  return new Response(JSON.stringify(data), {status, headers});
};

export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400);

  const forceRefresh = url.searchParams.get("refresh") === "1";
  const limit = Math.min(20, Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
  const next = url.searchParams.get("next");
  if (next && (next.length > 2048 || !/^[A-Za-z0-9_.~+/=-]+$/.test(next))) {
    return json({error:"Invalid pagination cursor."}, 400, forceRefresh);
  }

  // NodeMonkes uses Alchemy NFT API on Base; Base Punks keeps its existing OpenSea path.
  if (contract === NODEMONKES) {
    const configuredAlchemy = env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API;
    if (!configuredAlchemy) {
      return json({error:"Alchemy API secret is missing. Configure ALCHEMY_API_KEY (or ALCHEMY_API / ETHEREUM_API) in Cloudflare Pages Production."}, 503, forceRefresh);
    }

    let alchemyKey = String(configuredAlchemy).trim();
    try {
      if (/^https?:\/\//i.test(alchemyKey)) {
        const parsed = new URL(alchemyKey);
        const segments = parsed.pathname.split("/").filter(Boolean);
        const keyIndex = segments.findIndex(part => part === "v2" || part === "v3");
        if (keyIndex >= 0 && segments[keyIndex + 1]) alchemyKey = segments[keyIndex + 1];
        else return json({error:"ETHEREUM_API must contain an Alchemy API key or a supported Alchemy endpoint URL."}, 503, forceRefresh);
      }
    } catch {
      return json({error:"Alchemy API configuration is not a valid key or endpoint URL."}, 503, forceRefresh);
    }

    const upstream = new URL("https://base-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(alchemyKey) + "/getNFTsForContract");
    upstream.searchParams.set("contractAddress", contract);
    upstream.searchParams.set("withMetadata", "true");
    upstream.searchParams.set("limit", String(limit));
    if (next) upstream.searchParams.set("pageKey", next);

    let response;
    try {
      response = await fetch(upstream, {
        headers: {"accept":"application/json", ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
        ...(forceRefresh ? {cache:"no-store"} : {})
      });
    } catch {
      return json({error:"Alchemy is temporarily unreachable. Please retry."}, 502, forceRefresh);
    }
    if (!response.ok) {
      return json({
        error:response.status === 429 ? "Alchemy rate limit reached. Please retry shortly." : "Alchemy NFT API request failed.",
        upstreamStatus:response.status
      }, response.status === 429 ? 429 : 502, forceRefresh);
    }

    let data;
    try { data = await response.json(); }
    catch { return json({error:"Alchemy returned an invalid response."}, 502, forceRefresh); }

    const imageUrl = value => {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + trimmed.slice(7).replace(/^ipfs\//, "");
      if (trimmed.startsWith("ar://")) return "https://arweave.net/" + trimmed.slice(5);
      return trimmed;
    };
    const nfts = Array.isArray(data.nfts) ? data.nfts.map(n => {
      const tokenId = String(n.tokenId ?? n.token_id ?? "");
      const raw = n.raw || {};
      const metadata = raw.metadata || n.metadata || {};
      const image = n.image && typeof n.image === "object" ? n.image : {};
      const media = Array.isArray(n.media) ? n.media[0] || {} : {};
      // Alchemy versions/providers vary: image can be an object, a URL string,
      // or live under media[].gateway / raw.metadata.image.
      const candidates = [
        image.cachedUrl, image.thumbnailUrl, image.originalUrl, image.pngUrl,
        typeof n.image === "string" ? n.image : "",
        media.gateway, media.raw, media.thumbnail, media.uri,
        n.image_url, n.display_image_url, metadata.image, metadata.image_url,
        metadata.imageURI, metadata.imageUri, metadata.properties?.image
      ];
      const normalizedImage = candidates.map(imageUrl).find(Boolean) || "";
      const attributes = metadata.attributes || metadata.properties?.attributes || n.attributes || [];
      return {
        identifier: tokenId,
        token_id: tokenId,
        name: n.name || metadata.name || "",
        description: n.description || metadata.description || "",
        image_url: normalizedImage,
        display_image_url: normalizedImage,
        metadata: {
          name: metadata.name || n.name || "",
          description: metadata.description || n.description || "",
          image: normalizedImage,
          attributes: Array.isArray(attributes) ? attributes : []
        },
        opensea_url: tokenId
          ? "https://og.rarible.com/token/base/" + contract + ":" + encodeURIComponent(tokenId)
          : "https://og.rarible.com/collection/base/" + contract + "/items"
      };
    }) : [];

    return json({
      nfts,
      next:typeof data.pageKey === "string" ? data.pageKey : null,
      source:"alchemy",
      refreshed:forceRefresh,
      fetchedAt:new Date().toISOString()
    }, 200, forceRefresh);
  }

  const openSeaKey = env.OPENSEA_API || env.OPENSEA_API_KEY;
  if (!openSeaKey) return json({error:"OpenSea API secret (OPENSEA_API) is not configured for this Pages environment."}, 503, forceRefresh);
  const upstream = new URL("https://api.opensea.io/api/v2/chain/base/contract/" + contract + "/nfts");
  upstream.searchParams.set("limit", String(limit));
  if (next) upstream.searchParams.set("next", next);

  let response;
  try {
    response = await fetch(upstream, {
      headers: {"accept":"application/json","x-api-key":openSeaKey, ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
      ...(forceRefresh ? {cache:"no-store"} : {})
    });
  } catch {
    return json({error:"OpenSea is temporarily unreachable. Please retry."}, 502, forceRefresh);
  }
  if (!response.ok) {
    return json({
      error:response.status === 429 ? "OpenSea rate limit reached. Please retry shortly." : "OpenSea API request failed.",
      upstreamStatus:response.status
    }, response.status === 429 ? 429 : 502, forceRefresh);
  }
  let data;
  try { data = await response.json(); }
  catch { return json({error:"OpenSea returned an invalid response."}, 502, forceRefresh); }

  return json({
    nfts:Array.isArray(data.nfts) ? data.nfts : [],
    next:typeof data.next === "string" ? data.next : null,
    source:"opensea",
    refreshed:forceRefresh,
    fetchedAt:new Date().toISOString()
  }, 200, forceRefresh);
}
