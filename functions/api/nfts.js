const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const ALLOWED = new Set([PUNKS, NODEMONKES]);

const json = (data, status = 200, forceRefresh = false) => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*"
  };
  headers["cache-control"] = forceRefresh
    ? "no-store, no-cache, must-revalidate, max-age=0"
    : "public, max-age=20, s-maxage=60";
  if (forceRefresh) headers["pragma"] = "no-cache";
  return new Response(JSON.stringify(data), {status, headers});
};

function alchemyKeyFromConfig(configured) {
  const value = String(configured || "").trim();
  if (!/^https?:\/\//i.test(value)) return value;
  const parsed = new URL(value);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const index = segments.findIndex(part => part === "v2" || part === "v3");
  if (index >= 0 && segments[index + 1]) return segments[index + 1];
  throw new Error("Unsupported Alchemy endpoint URL.");
}

const imageUrl = value => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + trimmed.slice(7).replace(/^ipfs\//, "");
  if (trimmed.startsWith("ar://")) return "https://arweave.net/" + trimmed.slice(5);
  return trimmed;
};

function encodeOpenSeaCursor(cursor) {
  return cursor ? "os_" + btoa(cursor).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : null;
}
function decodeOpenSeaCursor(cursor) {
  const value = cursor.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  return atob(value + "=".repeat((4 - value.length % 4) % 4));
}

function normalizeAlchemyNft(n, contract) {
  const tokenId = String(n.tokenId ?? n.token_id ?? n.identifier ?? "");
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
}

function normalizeOpenSeaNft(n, contract) {
  const tokenId = String(n.identifier ?? n.token_id ?? n.tokenId ?? "");
  const metadata = n.metadata || {};
  const normalizedImage = [
    n.display_image_url, n.image_url, n.image_preview_url, metadata.image
  ].map(imageUrl).find(Boolean) || "";
  return {
    identifier: tokenId,
    token_id: tokenId,
    name: n.name || metadata.name || (tokenId ? "Token #" + tokenId : ""),
    description: n.description || metadata.description || "",
    image_url: normalizedImage,
    display_image_url: normalizedImage,
    metadata: {
      name: n.name || metadata.name || "",
      description: n.description || metadata.description || "",
      image: normalizedImage,
      attributes: Array.isArray(n.traits) ? n.traits : Array.isArray(metadata.attributes) ? metadata.attributes : []
    },
    opensea_url: tokenId
      ? "https://og.rarible.com/token/base/" + contract + ":" + encodeURIComponent(tokenId)
      : "https://og.rarible.com/collection/base/" + contract + "/items"
  };
}

async function fetchOpenSea({contract, limit, cursor, apiKey, forceRefresh}) {
  const endpoint = new URL("https://api.opensea.io/api/v2/chain/base/contract/" + contract + "/nfts");
  endpoint.searchParams.set("limit", String(limit));
  if (cursor) endpoint.searchParams.set("next", cursor);
  const response = await fetch(endpoint, {
    headers: {
      "accept": "application/json",
      "x-api-key": apiKey,
      ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})
    },
    ...(forceRefresh ? {cache:"no-store"} : {})
  });
  if (!response.ok) return {ok:false, status:response.status};
  const data = await response.json();
  return {
    ok:true,
    nfts:Array.isArray(data.nfts) ? data.nfts.map(n => normalizeOpenSeaNft(n, contract)) : [],
    next:typeof data.next === "string" ? data.next : null
  };
}

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

  const openSeaKey = env.OPENSEA_API || env.OPENSEA_API_KEY;
  const isOpenSeaCursor = Boolean(next && next.startsWith("os_"));
  let openSeaCursor = null;
  try {
    if (isOpenSeaCursor) openSeaCursor = decodeOpenSeaCursor(next);
  } catch {
    return json({error:"Invalid pagination cursor."}, 400, forceRefresh);
  }

  // Alchemy is primary; OpenSea is a server-side fallback so an Alchemy
  // outage or empty index does not blank the collection page.
  let alchemyError = null;
  const configuredAlchemy = env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API;
  if (configuredAlchemy && !isOpenSeaCursor) {
    try {
      const key = alchemyKeyFromConfig(configuredAlchemy);
      if (!key) throw new Error("Missing Alchemy key");
      const upstream = new URL("https://base-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(key) + "/getNFTsForContract");
      upstream.searchParams.set("contractAddress", contract);
      upstream.searchParams.set("withMetadata", "true");
      upstream.searchParams.set("limit", String(limit));
      if (next) upstream.searchParams.set("pageKey", next);

      const response = await fetch(upstream, {
        headers: {"accept":"application/json", ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
        ...(forceRefresh ? {cache:"no-store"} : {})
      });
      if (!response.ok) alchemyError = response.status;
      else {
        const data = await response.json();
        const nfts = Array.isArray(data.nfts) ? data.nfts.map(n => normalizeAlchemyNft(n, contract)) : [];
        // For NodeMonkes, an indexed token without artwork is not enough:
        // let the Rarible fallback supply the actual collection media.
        if (nfts.length && (contract !== NODEMONKES || nfts.some(n => Boolean(n.image_url)))) {
          return json({
            nfts,
            next:typeof data.pageKey === "string" ? data.pageKey : null,
            source:"alchemy",
            refreshed:forceRefresh,
            fetchedAt:new Date().toISOString()
          }, 200, forceRefresh);
        }
        alchemyError = nfts.length ? "missing-artwork" : "empty";
      }
    } catch {
      alchemyError = "network";
    }
  }

  // Rarible is the collection-native fallback for NodeMonkes on Base.
  // Keep this server-side so the API key is never exposed to browsers.
  const raribleKey = env.RARIBLE_API_KEY;
  if (contract === NODEMONKES && raribleKey && !isOpenSeaCursor) {
    try {
      const endpoint = new URL("https://api.rarible.org/v0.1/items/byCollection");
      endpoint.searchParams.set("collection", "BASE:" + contract);
      endpoint.searchParams.set("size", String(limit));
      if (next && !next.startsWith("os_")) endpoint.searchParams.set("continuation", next);
      const response = await fetch(endpoint, {
        headers: {"accept":"application/json", "X-API-KEY":raribleKey,
          ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
        ...(forceRefresh ? {cache:"no-store"} : {})
      });
      if (response.ok) {
        const data = await response.json();
        const nfts = (Array.isArray(data.items) ? data.items : []).map(item => {
          const tokenId = String(item.tokenId || item.id?.split(":").pop() || "");
          const meta = item.meta || {};
          const content = Array.isArray(meta.content) ? meta.content : [];
          const image = content.find(x => /image|video/i.test(String(x?.["@type"] || x?.type || "")) && x?.url)?.url
            || content.find(x => x?.url)?.url || meta.image?.url || meta.image || "";
          const normalized = imageUrl(typeof image === "string" ? image : "");
          return {
            identifier:tokenId, token_id:tokenId,
            name:meta.name || (tokenId ? "Token #" + tokenId : ""),
            description:meta.description || "",
            image_url:normalized, display_image_url:normalized,
            metadata:{name:meta.name || "",description:meta.description || "",image:normalized,
              attributes:Array.isArray(meta.attributes) ? meta.attributes : []},
            price:item.bestSellOrder?.make?.value || null,
            opensea_url:tokenId ? "https://og.rarible.com/token/base/" + contract + ":" + encodeURIComponent(tokenId)
              : "https://og.rarible.com/collection/base/" + contract + "/items"
          };
        }).filter(n => n.identifier);
        if (nfts.length) return json({
          nfts, next:typeof data.continuation === "string" ? data.continuation : null,
          source:"rarible", refreshed:forceRefresh, fetchedAt:new Date().toISOString()
        }, 200, forceRefresh);
      }
    } catch {
      // Continue to OpenSea fallback if Rarible is unavailable.
    }
  }

  if (openSeaKey) {
    try {
      const fallback = await fetchOpenSea({
        contract, limit, cursor:isOpenSeaCursor ? openSeaCursor : null,
        apiKey:openSeaKey, forceRefresh
      });
      if (fallback.ok && fallback.nfts.length) {
        return json({
          nfts:fallback.nfts,
          next:encodeOpenSeaCursor(fallback.next),
          source:"opensea",
          refreshed:forceRefresh,
          fetchedAt:new Date().toISOString()
        }, 200, forceRefresh);
      }
      if (fallback.ok) {
        return json({
          nfts:[],
          next:null,
          source:"opensea",
          message:"No indexed NFTs were returned for this contract.",
          refreshed:forceRefresh,
          fetchedAt:new Date().toISOString()
        }, 200, forceRefresh);
      }
      return json({
        error:fallback.status === 429 ? "NFT provider rate limit reached. Please retry shortly." : "Alchemy and OpenSea could not load this collection.",
        upstreamStatus:fallback.status,
        source:null
      }, fallback.status === 429 ? 429 : 502, forceRefresh);
    } catch {
      return json({error:"Alchemy and OpenSea collection APIs are temporarily unavailable.",source:null}, 502, forceRefresh);
    }
  }

  return json({
    error:!configuredAlchemy
      ? "Configure ALCHEMY_API (or ALCHEMY_API_KEY / ETHEREUM_API) or OPENSEA_API in Cloudflare Pages."
      : alchemyError === 429
        ? "Alchemy rate limit reached and no OpenSea fallback key is configured."
        : "Alchemy returned no collection items and no OpenSea fallback key is configured.",
    source:null
  }, 503, forceRefresh);
}
