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

function alchemyKeyFromConfig(configured) {
  let key = String(configured || "").trim();
  if (/^https?:\/\//i.test(key)) {
    const parsed = new URL(key);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const keyIndex = segments.findIndex(part => part === "v2" || part === "v3");
    if (keyIndex >= 0 && segments[keyIndex + 1]) return segments[keyIndex + 1];
    throw new Error("Configure an Alchemy API key or supported Alchemy endpoint URL.");
  }
  return key;
}

const imageUrl = value => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + trimmed.slice(7).replace(/^ipfs\//, "");
  if (trimmed.startsWith("ar://")) return "https://arweave.net/" + trimmed.slice(5);
  return trimmed;
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

  // Both Base Punks and NodeMonkes use Alchemy's Base NFT API.
  // Keep the provider key server-side in Cloudflare Pages environment variables.
  const configuredAlchemy = env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API;
  if (!configuredAlchemy) {
    return json({error:"Alchemy API secret is missing. Configure ALCHEMY_API_KEY (or ALCHEMY_API / ETHEREUM_API) in Cloudflare Pages Production."}, 503, forceRefresh);
  }

  let alchemyKey;
  try {
    alchemyKey = alchemyKeyFromConfig(configuredAlchemy);
  } catch {
    return json({error:"Alchemy API configuration is not a valid key or supported endpoint URL."}, 503, forceRefresh);
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

  const nfts = Array.isArray(data.nfts) ? data.nfts.map(n => {
    const tokenId = String(n.tokenId ?? n.token_id ?? "");
    const raw = n.raw || {};
    const metadata = raw.metadata || n.metadata || {};
    const image = n.image && typeof n.image === "object" ? n.image : {};
    const media = Array.isArray(n.media) ? n.media[0] || {} : {};
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
