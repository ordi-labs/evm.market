const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const NODEMONKES_POLYGON = "0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
const BYTEBEASTS = "0x7325654c657520e30c56a04225a3d9acdf895e55";
const CRYPTOPUNKS_BASE = "0x18d91b5597f1a7227d2960945c9a1417f0ff721d";
const COLLECTION_SLUGS = new Map([[PUNKS,"punks-base-1"],[NODEMONKES,"nodemonkes"],[BYTEBEASTS,"bytebeasts-base"],[CRYPTOPUNKS_BASE,"cryptopunks-base"]]);
const ALLOWED = new Set([PUNKS, NODEMONKES, BYTEBEASTS, CRYPTOPUNKS_BASE, NODEMONKES_POLYGON]);
const OPENSEA_PRIMARY = new Set([BYTEBEASTS, CRYPTOPUNKS_BASE]);

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
function encodePolygonCursor(cursor) {
  return cursor ? "pg_" + btoa(cursor).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : null;
}
function decodePolygonCursor(cursor) {
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
    opensea_url: contract === NODEMONKES_POLYGON
      ? (tokenId ? "https://og.rarible.com/token/polygon/" + contract + ":" + encodeURIComponent(tokenId) : "https://og.rarible.com/collection/polygon/" + contract + "/items")
      : (tokenId ? "https://og.rarible.com/token/base/" + contract + ":" + encodeURIComponent(tokenId) : "https://og.rarible.com/collection/base/" + contract + "/items")
  };
}

async function fetchPolygonAlchemyPage({contract, limit, cursor, key, forceRefresh}) {
  const endpoint = new URL("https://polygon-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(key) + "/getNFTsForContract");
  endpoint.searchParams.set("contractAddress", contract);
  endpoint.searchParams.set("withMetadata", "true");
  endpoint.searchParams.set("limit", String(limit));
  if (cursor) endpoint.searchParams.set("pageKey", cursor);
  const response = await fetch(endpoint, {
    headers: {"accept":"application/json", ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
    ...(forceRefresh ? {cache:"no-store"} : {})
  });
  if (!response.ok) return {ok:false,status:response.status};
  const data = await response.json();
  const nfts = Array.isArray(data.nfts) ? await Promise.all(data.nfts.map(async nft =>
    normalizeAlchemyNft(await resolveAlchemyMetadata(nft, forceRefresh), contract)
  )) : [];
  return {ok:true,nfts,next:typeof data.pageKey === "string" ? data.pageKey : null};
}

async function refreshAlchemyTokenMetadata(nft, key, contract) {
  const tokenId = String(nft?.tokenId ?? nft?.token_id ?? nft?.identifier ?? "");
  if (!tokenId) return nft;
  try {
    const endpoint = new URL("https://base-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(key) + "/getNFTMetadata");
    endpoint.searchParams.set("contractAddress", contract);
    endpoint.searchParams.set("tokenId", tokenId);
    endpoint.searchParams.set("refreshCache", "true");
    const response = await fetch(endpoint, {
      headers: {"accept":"application/json","cache-control":"no-cache","pragma":"no-cache"},
      cache:"no-store"
    });
    if (!response.ok) return nft;
    const fresh = await response.json();
    return {
      ...nft,
      ...fresh,
      raw: {...(nft.raw || {}), ...(fresh.raw || {}), metadata: {...(nft.raw?.metadata || {}), ...(fresh.raw?.metadata || {})}},
      metadata: {...(nft.metadata || {}), ...(fresh.metadata || {})}
    };
  } catch {
    return nft;
  }
}

async function resolveAlchemyMetadata(nft, forceRefresh = false) {
  const raw = nft?.raw || {};
  const existing = raw.metadata || nft?.metadata || {};
  const tokenUri = nft?.tokenUri;
  const candidates = [
    typeof tokenUri === "string" ? tokenUri : "",
    tokenUri?.gateway,
    tokenUri?.raw
  ].map(imageUrl).filter(value => /^https?:\/\//i.test(value));
  const image = existing.image || existing.image_url || existing.imageURI || existing.imageUri || existing.properties?.image;
  if (!forceRefresh && typeof image === "string" && image.trim()) return nft;
  for (const uri of candidates) {
    try {
      const response = await fetch(uri, {
        headers: {"accept":"application/json", ...(forceRefresh ? {"cache-control":"no-cache","pragma":"no-cache"} : {})},
        ...(forceRefresh ? {cache:"no-store"} : {})
      });
      if (!response.ok) continue;
      const metadata = await response.json();
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
      return {...nft, raw: {...raw, metadata: {...existing, ...metadata}}, metadata: {...(nft.metadata || {}), ...metadata}};
    } catch {
      // Try the next Alchemy-provided metadata URI.
    }
  }
  return nft;
}

function normalizeOpenSeaNft(n, contract, chain = "base") {
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
      attributes: Array.isArray(n.traits) ? n.traits : Array.isArray(metadata.attributes) ? metadata.attributes : Array.isArray(n.attributes) ? n.attributes : []
    },
    opensea_url: tokenId
      ? "https://opensea.io/assets/" + chain + "/" + contract + "/" + encodeURIComponent(tokenId)
      : "https://opensea.io/collection/" + (COLLECTION_SLUGS.get(contract) || "") + "?status=all"
  };
}

function mergeArtworkFromOpenSea(alchemyNfts, openSeaNfts) {
  const byId = new Map(openSeaNfts.map(n => [String(n.identifier || n.token_id || ""), n]));
  return alchemyNfts.map(n => {
    const id = String(n.identifier || n.token_id || "");
    const fallback = byId.get(id);
    if (n.image_url || !fallback) return n;
    const image = fallback.image_url || fallback.display_image_url || fallback.metadata?.image || "";
    if (!image) return n;
    return {
      ...n,
      image_url: image,
      display_image_url: image,
      metadata: {...(n.metadata || {}), image}
    };
  });
}

async function fetchOpenSea({contract, chain = "base", limit, cursor, apiKey, forceRefresh}) {
  const endpoint = new URL("https://api.opensea.io/api/v2/chain/" + chain + "/contract/" + contract + "/nfts");
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
    nfts:Array.isArray(data.nfts) ? data.nfts.map(n => normalizeOpenSeaNft(n, contract, chain)) : [],
    next:typeof data.next === "string" ? data.next : null
  };
}

async function fillMissingOpenSeaTraits({contract,chain="base",nfts,apiKey}) {
  const missing=nfts.filter(n=>!Array.isArray(n.metadata?.attributes)||n.metadata.attributes.length===0);
  if(!missing.length)return {ok:true,nfts};
  const identifiers=missing.map(n=>String(n.identifier||n.token_id||"")).filter(Boolean).map(token_id=>({chain,contract_address:contract,token_id}));
  if(!identifiers.length)return {ok:true,nfts};
  const response=await fetch("https://api.opensea.io/api/v2/nfts/batch",{method:"POST",headers:{accept:"application/json","content-type":"application/json","x-api-key":apiKey},body:JSON.stringify({identifiers})});
  if(!response.ok)return {ok:false,status:response.status};
  const data=await response.json();
  const byId=new Map((Array.isArray(data.nfts)?data.nfts:[]).map(n=>[String(n.identifier??n.token_id??n.tokenId??""),n]));
  return {ok:true,nfts:nfts.map(n=>{
    if(Array.isArray(n.metadata?.attributes)&&n.metadata.attributes.length)return n;
    const batch=byId.get(String(n.identifier||n.token_id||""));
    const metadata=batch?.metadata||{};
    const attributes=Array.isArray(batch?.traits)?batch.traits:Array.isArray(metadata.attributes)?metadata.attributes:Array.isArray(batch?.attributes)?batch.attributes:[];
    return {...n,metadata:{...(n.metadata||{}),attributes}};
  })};
}
async function fetchOpenSeaTraitPage({contract, traitType, traitValue, limit, cursor, apiKey}) {
  const slug = COLLECTION_SLUGS.get(contract);
  const endpoint = new URL("https://api.opensea.io/api/v2/collection/" + encodeURIComponent(slug) + "/nfts");
  endpoint.searchParams.set("limit", String(limit));
  endpoint.searchParams.set("traits", JSON.stringify([{traitType, value: traitValue}]));
  if (cursor) endpoint.searchParams.set("next", cursor);
  const response = await fetch(endpoint, {headers:{accept:"application/json","x-api-key":apiKey}});
  if (!response.ok) return {ok:false,status:response.status};
  const data = await response.json();
  return {ok:true,nfts:Array.isArray(data.nfts)?data.nfts.map(n=>normalizeOpenSeaNft(n,contract)):[],next:typeof data.next==="string"?data.next:null};
}

export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400);

  const forceRefresh = url.searchParams.get("refresh") === "1";
  const scanTraits = url.searchParams.get("scanTraits") === "1";
  const requestedLimit = Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20);
  const limit = Math.min(scanTraits ? 50 : 20, requestedLimit);
  const nextProvided = url.searchParams.has("next");
  const next = url.searchParams.get("next");
  if (next && (next.length > 2048 || !/^[A-Za-z0-9_.~+/=-]+$/.test(next))) {
    return json({error:"Invalid pagination cursor."}, 400, forceRefresh);
  }
  if (scanTraits && nextProvided && (!next || !next.startsWith("os_"))) {
    return json({error:"Invalid collection scan cursor."}, 400, true);
  }

  const openSeaKey = env.OPENSEA_API_KEY || env.OPENSEA_API;
  const isOpenSeaCursor = Boolean(next && next.startsWith("os_"));
  const isPolygonCursor = Boolean(next && next.startsWith("pg_"));
  if (contract === NODEMONKES_POLYGON && next && !(scanTraits ? isOpenSeaCursor : isPolygonCursor)) return json({error:"Invalid Polygon pagination cursor."}, 400, forceRefresh);
  if (contract !== NODEMONKES_POLYGON && isPolygonCursor) return json({error:"Invalid collection pagination cursor."}, 400, forceRefresh);
  let openSeaCursor = null;
  let polygonCursor = null;
  try {
    if (isOpenSeaCursor) openSeaCursor = decodeOpenSeaCursor(next);
  } catch {
    return json({error:"Invalid pagination cursor."}, 400, forceRefresh);
  }
  if (isPolygonCursor) {
    try { polygonCursor = decodePolygonCursor(next); }
    catch { return json({error:"Invalid Polygon pagination cursor."}, 400, forceRefresh); }
  }
  if (scanTraits && nextProvided && contract !== NODEMONKES_POLYGON && !openSeaCursor) {
    return json({error:"Invalid collection scan cursor."}, 400, true);
  }

  if (scanTraits && contract === NODEMONKES_POLYGON) {
    if (openSeaKey) {
      try {
        const result = await fetchOpenSea({contract,chain:"polygon",limit,cursor:openSeaCursor,apiKey:openSeaKey,forceRefresh:true});
        if (!result.ok) return json({error:result.status===429?"OpenSea rate limit reached while scanning Polygon NodeMonkes traits.":"OpenSea Polygon collection scan is temporarily unavailable.",upstreamStatus:result.status,source:"opensea-trait-index"},result.status===429?429:502,true);
        const enriched=await fillMissingOpenSeaTraits({contract,chain:"polygon",nfts:result.nfts,apiKey:openSeaKey});
        if (!enriched.ok) return json({error:enriched.status===429?"OpenSea rate limit reached while loading Polygon NFT traits.":"OpenSea Polygon NFT traits are temporarily unavailable.",upstreamStatus:enriched.status,source:"opensea-trait-index"},enriched.status===429?429:502,true);
        return json({nfts:enriched.nfts,next:encodeOpenSeaCursor(result.next),source:"opensea-trait-index",pageSize:limit},200,true);
      } catch {
        return json({error:"OpenSea Polygon collection scan is temporarily unavailable.",source:"opensea-trait-index"},502,true);
      }
    }
    const configured = env.ALCHEMY_POLYGON_API || env.ALCHEMY_API_KEY || env.ALCHEMY_API;
    if (!configured) return json({error:"OPENSEA_API_KEY is required to scan Polygon NodeMonkes traits."}, 503, true);
    try {
      const key = alchemyKeyFromConfig(configured);
      const result = await fetchPolygonAlchemyPage({contract,limit,cursor:polygonCursor,key,forceRefresh:true});
      if (!result.ok) return json({error:result.status === 429 ? "Alchemy rate limit reached while scanning Polygon NodeMonkes." : "Polygon NFT scan is temporarily unavailable.",upstreamStatus:result.status,source:"alchemy-trait-index"},result.status === 429 ? 429 : 502,true);
      return json({nfts:result.nfts,next:encodePolygonCursor(result.next),source:"alchemy-trait-index",pageSize:limit},200,true);
    } catch {
      return json({error:"Polygon NFT scan is temporarily unavailable.",source:"alchemy-trait-index"},502,true);
    }
  }

  if (scanTraits) {
    if (!openSeaKey) return json({error:"OpenSea API is required to scan all collection traits."}, 503, true);
    try {
      const result = await fetchOpenSea({contract,limit,cursor:isOpenSeaCursor?openSeaCursor:null,apiKey:openSeaKey,forceRefresh:true});
      if (!result.ok) return json({error:result.status===429?"OpenSea rate limit reached while scanning collection traits.":"OpenSea collection scan is temporarily unavailable.",upstreamStatus:result.status,source:"opensea-trait-index"},result.status===429?429:502,true);
      const enriched=await fillMissingOpenSeaTraits({contract,chain:"base",nfts:result.nfts,apiKey:openSeaKey});
      if (!enriched.ok) return json({error:enriched.status===429?"OpenSea rate limit reached while loading NFT traits.":"OpenSea NFT traits are temporarily unavailable.",upstreamStatus:enriched.status,source:"opensea-trait-index"},enriched.status===429?429:502,true);
      return json({nfts:enriched.nfts,next:encodeOpenSeaCursor(result.next),source:"opensea-trait-index",pageSize:limit},200,true);
    } catch {
      return json({error:"OpenSea collection scan is temporarily unavailable.",source:"opensea-trait-index"},502,true);
    }
  }
  const traitType = (url.searchParams.get("traitType") || "").trim();
  const traitValue = (url.searchParams.get("traitValue") || "").trim();
  if (traitType.length > 128 || traitValue.length > 256 || Boolean(traitType) !== Boolean(traitValue)) {
    return json({error:"Choose a valid trait type and value."}, 400, forceRefresh);
  }
  if (traitType && traitValue) {
    if (contract === NODEMONKES_POLYGON) return json({error:"Polygon NodeMonkes traits are filtered from the complete local index; finish the collection scan first."}, 409, forceRefresh);
    if (!openSeaKey) return json({error:"OpenSea API is not configured on the server."}, 503, forceRefresh);
    try {
      const result = await fetchOpenSeaTraitPage({contract,traitType,traitValue,limit,cursor:isOpenSeaCursor?openSeaCursor:null,apiKey:openSeaKey});
      if (!result.ok) return json({error:result.status===429?"OpenSea rate limit reached. Retry shortly.":"OpenSea trait-filtered NFT data is temporarily unavailable.",upstreamStatus:result.status,source:"opensea"},result.status===429?429:502,forceRefresh);
      return json({nfts:result.nfts,next:encodeOpenSeaCursor(result.next),source:"opensea-traits",refreshed:forceRefresh,fetchedAt:new Date().toISOString()},200,forceRefresh);
    } catch {
      return json({error:"OpenSea trait-filtered NFT data is temporarily unavailable.",source:"opensea"},502,forceRefresh);
    }
  }

  // NodeMonkes Polygon uses OpenSea as the live source when OPENSEA_API_KEY is configured.
  // Alchemy remains a compatibility fallback for existing deployments.
  if (contract === NODEMONKES_POLYGON) {
    if (openSeaKey && !isPolygonCursor) {
      try {
        const result = await fetchOpenSea({contract,chain:"polygon",limit,cursor:isOpenSeaCursor?openSeaCursor:null,apiKey:openSeaKey,forceRefresh:true});
        if (!result.ok) return json({error:result.status===429?"OpenSea rate limit reached. Retry shortly.":"OpenSea Polygon collection data is temporarily unavailable.",upstreamStatus:result.status,source:"opensea"},result.status===429?429:502,true);
        const enriched=await fillMissingOpenSeaTraits({contract,chain:"polygon",nfts:result.nfts,apiKey:openSeaKey});
        if (!enriched.ok) return json({error:"OpenSea Polygon NFT metadata is temporarily unavailable.",upstreamStatus:enriched.status,source:"opensea"},enriched.status===429?429:502,true);
        return json({nfts:enriched.nfts,next:encodeOpenSeaCursor(result.next),source:"opensea",refreshed:true,fetchedAt:new Date().toISOString()},200,true);
      } catch {
        return json({error:"OpenSea Polygon collection data is temporarily unavailable.",source:"opensea"},502,true);
      }
    }
    const configured = env.ALCHEMY_POLYGON_API || env.ALCHEMY_API_KEY || env.ALCHEMY_API;
    if (!configured) return json({error:"OPENSEA_API_KEY is required for live Polygon NFT data.",source:null},503,forceRefresh);
    try {
      const key = alchemyKeyFromConfig(configured);
      const result = await fetchPolygonAlchemyPage({contract,limit,cursor:polygonCursor,key,forceRefresh});
      if (!result.ok) return json({error:result.status === 429 ? "Alchemy rate limit reached. Retry shortly." : "Polygon NFT data is temporarily unavailable.",upstreamStatus:result.status,source:"alchemy"},result.status === 429 ? 429 : 502,forceRefresh);
      return json({nfts:result.nfts,next:encodePolygonCursor(result.next),source:"alchemy",refreshed:forceRefresh,fetchedAt:new Date().toISOString()},200,forceRefresh);
    } catch {
      return json({error:"Polygon NFT data is temporarily unavailable.",source:"alchemy"},502,forceRefresh);
    }
  }

  // BYTEBEASTS and CryptoPunks [Base] use OpenSea as their authoritative collection feed.
  if (OPENSEA_PRIMARY.has(contract)) {
    if (!openSeaKey) {
      return json({
        error:"This collection requires OPENSEA_API_KEY in Cloudflare Pages; OpenSea is configured as the primary source.",
        source:null
      }, 503, forceRefresh);
    }
    try {
      const result = await fetchOpenSea({
        contract,
        limit,
        cursor:isOpenSeaCursor ? openSeaCursor : null,
        apiKey:openSeaKey,
        forceRefresh:true
      });
      if (!result.ok) {
        return json({
          error:result.status === 429
            ? "OpenSea rate limit reached. Retry shortly."
            : "OpenSea could not return collection metadata.",
          upstreamStatus:result.status,
          source:"opensea"
        }, result.status === 429 ? 429 : 502, true);
      }
      return json({
        nfts:result.nfts,
        next:encodeOpenSeaCursor(result.next),
        source:"opensea",
        refreshed:true,
        fetchedAt:new Date().toISOString()
      }, 200, true);
    } catch {
      return json({error:"OpenSea collection feed is temporarily unavailable.",source:"opensea"}, 502, true);
    }
  }

  // Alchemy remains primary for Base Punks and NodeMonkes; OpenSea is their fallback.
  let alchemyError = null;
  const configuredAlchemy = contract === NODEMONKES
    ? (env.ETHEREUM_API || env.ALCHEMY_API_KEY || env.ALCHEMY_API)
    : (env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API);
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
        const nfts = Array.isArray(data.nfts) ? await Promise.all(data.nfts.map(async n => {
          const latest = contract === BYTEBEASTS && forceRefresh
            ? await refreshAlchemyTokenMetadata(n, key, contract)
            : n;
          return normalizeAlchemyNft(
            await resolveAlchemyMetadata(latest, contract === BYTEBEASTS && forceRefresh),
            contract
          );
        })) : [];
        if (nfts.length && nfts.every(n => Boolean(n.image_url))) {
          return json({
            nfts,
            next:typeof data.pageKey === "string" ? data.pageKey : null,
            source:"alchemy",
            refreshed:forceRefresh,
            fetchedAt:new Date().toISOString()
          }, 200, forceRefresh);
        }
        if (nfts.length && (contract === NODEMONKES || contract === BYTEBEASTS) && openSeaKey) {
          const fallback = await fetchOpenSea({contract, limit, cursor:null, apiKey:openSeaKey, forceRefresh});
          if (fallback.ok && fallback.nfts.length) {
            const merged = mergeArtworkFromOpenSea(nfts, fallback.nfts);
            if (merged.some(n => Boolean(n.image_url))) {
              return json({
                nfts:merged,
                next:typeof data.pageKey === "string" ? data.pageKey : encodeOpenSeaCursor(fallback.next),
                source:"alchemy+opensea",
                refreshed:forceRefresh,
                fetchedAt:new Date().toISOString()
              }, 200, forceRefresh);
            }
          }
        }
        if (nfts.length && contract === PUNKS) {
          return json({
            nfts,
            next:typeof data.pageKey === "string" ? data.pageKey : null,
            source:"alchemy",
            refreshed:forceRefresh,
            fetchedAt:new Date().toISOString()
          }, 200, forceRefresh);
        }
        alchemyError = "empty";
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
      ? "Configure ALCHEMY_API (or ALCHEMY_API_KEY / ETHEREUM_API) or OPENSEA_API_KEY in Cloudflare Pages."
      : alchemyError === 429
        ? "Alchemy rate limit reached and no OpenSea fallback key is configured."
        : "Alchemy returned no collection items and no OpenSea fallback key is configured.",
    source:null
  }, 503, forceRefresh);
}
