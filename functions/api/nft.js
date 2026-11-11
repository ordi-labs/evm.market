const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const BYTEBEASTS = "0x7325654c657520e30c56a04225a3d9acdf895e55";
const NEXUS_LEGENDS = "0x353a98c65b427294412fae0187e551698eb1c8d6";
const NEON_RELICS = "0x64d94e792076da8df31d06e15e7ab4e152999c06";
const BASE_ODDITIES = "0x8b245812b0755b7e0259395beca3e591734660fb";
const PIXEL_NOMADS = "0x13ef1ea93602873d11a92bc434c8ed580487b2dc";
const CRYPTOPUNKS_BASE = "0x18d91b5597f1a7227d2960945c9a1417f0ff721d";
const NODEMONKES_POLYGON = "0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
const PUNKS_POLYGON = "0xba193df461d83ecb40717d334f30c8b09209a6f4";
const ALLOWED = new Set([PUNKS, NODEMONKES, BYTEBEASTS, NEXUS_LEGENDS, NEON_RELICS, BASE_ODDITIES, PIXEL_NOMADS, CRYPTOPUNKS_BASE, NODEMONKES_POLYGON, PUNKS_POLYGON]);
const NETWORK = contract => [NODEMONKES_POLYGON, PUNKS_POLYGON].includes(contract) ? "polygon" : "base";
const json = (data, status = 200, forceRefresh = false) => new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","cache-control":forceRefresh ? "no-store, no-cache, must-revalidate, max-age=0" : "public, max-age=15, s-maxage=30","pragma":forceRefresh ? "no-cache" : "","x-content-type-options":"nosniff","access-control-allow-origin":"*"}});
const text = value => typeof value === "string" ? value : "";
function ownerAddress(nft) {
  const owners = Array.isArray(nft?.owners) ? nft.owners : [];
  const first = owners.find(o => typeof o?.address === "string" && o.address);
  return first?.address || nft?.owner || "";
}
function alchemyKeyFromConfig(configured) {
  let key = String(configured || "").trim();
  if (/^https?:\/\//i.test(key)) {
    const parsed = new URL(key);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const index = segments.findIndex(part => part === "v2" || part === "v3");
    if (index >= 0 && segments[index + 1]) return segments[index + 1];
    throw new Error("Unsupported Alchemy endpoint URL.");
  }
  return key;
}
function normalizeImage(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("ipfs://")) return "https://ipfs.io/ipfs/" + trimmed.slice(7).replace(/^ipfs\//, "");
  if (trimmed.startsWith("ar://")) return "https://arweave.net/" + trimmed.slice(5);
  return trimmed;
}
function hasUsableImage(nft) {
  const metadata = nft?.metadata || nft?.raw?.metadata || {};
  const image = nft?.image;
  const candidates = [image?.cachedUrl, image?.originalUrl, image?.thumbnailUrl, image?.pngUrl, typeof image === "string" ? image : "", nft?.image_url, nft?.display_image_url, metadata.image, metadata.image_url, metadata.imageURI, metadata.imageUri];
  return candidates.some(value => typeof value === "string" && value.trim().length > 0);
}
async function resolveAlchemyMetadata(nft) {
  const raw = nft?.raw || {};
  const existing = raw.metadata || nft?.metadata || {};
  const tokenUri = nft?.tokenUri;
  const candidates = [
    typeof tokenUri === "string" ? tokenUri : "",
    tokenUri?.gateway,
    tokenUri?.raw
  ].map(normalizeImage).filter(value => /^https?:\/\//i.test(value));
  const image = existing.image || existing.image_url || existing.imageURI || existing.imageUri || existing.properties?.image;
  if (typeof image === "string" && image.trim()) return nft;
  for (const uri of candidates) {
    try {
      const response = await fetch(uri, {headers: {"accept":"application/json"}});
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
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  const tokenId = (url.searchParams.get("tokenId") || "").trim();
  const forceOpenSea = url.searchParams.get("fallback") === "1";
  const preferOpenSea = contract === PUNKS_POLYGON || contract === BYTEBEASTS || contract === NEXUS_LEGENDS || contract === NEON_RELICS || contract === BASE_ODDITIES || contract === PIXEL_NOMADS || contract === CRYPTOPUNKS_BASE || (forceOpenSea && contract !== NODEMONKES_POLYGON);
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400, forceOpenSea);
  if (!tokenId || tokenId.length > 100 || !/^[0-9]+$/.test(tokenId)) return json({error:"A numeric tokenId is required."}, 400, forceOpenSea);

  // Alchemy is the primary metadata source for Base Punks and NodeMonkes.
  // BYTEBEASTS, Nexus//Legends, Base Oddities, Pixel Nomads, and CryptoPunks [Base] use OpenSea as their authoritative collection source.
  let alchemyNft = null;
  let alchemyError = null;
  const configured = contract === NODEMONKES
    ? (env.ETHEREUM_API || env.ALCHEMY_API_KEY || env.ALCHEMY_API)
    : (env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API);
  if (configured && !preferOpenSea) {
    try {
      const key = alchemyKeyFromConfig(configured);
      const alchemyNetwork = NETWORK(contract) === "polygon" ? "polygon-mainnet" : "base-mainnet";
      const endpoint = new URL("https://" + alchemyNetwork + ".g.alchemy.com/nft/v3/" + encodeURIComponent(key) + "/getNFTMetadata");
      endpoint.searchParams.set("contractAddress", contract);
      endpoint.searchParams.set("tokenId", tokenId);
      endpoint.searchParams.set("refreshCache", "false");
      const response = await fetch(endpoint, {headers: {"accept":"application/json"}});
      if (response.ok) {
        alchemyNft = await response.json();
        if (!hasUsableImage(alchemyNft)) alchemyNft = await resolveAlchemyMetadata(alchemyNft);
      } else alchemyError = response.status;
    } catch { alchemyError = "network"; }
  }

  // Keep OpenSea as a server-side fallback if Alchemy cannot return this NFT.
  let openSeaNft = null;
  let openSeaError = null;
  const apiKey = env.OPENSEA_API_KEY || env.OPENSEA_API;
  if ((preferOpenSea || !alchemyNft || !hasUsableImage(alchemyNft)) && apiKey) {
    try {
      const endpoint = new URL("https://api.opensea.io/api/v2/chain/" + NETWORK(contract) + "/contract/" + contract + "/nfts/" + encodeURIComponent(tokenId));
      const response = await fetch(endpoint, {headers: {"accept":"application/json", "x-api-key":apiKey, ...(forceOpenSea ? {"cache-control":"no-cache","pragma":"no-cache"} : {})}, ...(forceOpenSea ? {cache:"no-store"} : {})});
      if (response.ok) {
        const data = await response.json();
        openSeaNft = data.nft || data;
      } else openSeaError = response.status;
    } catch { openSeaError = "network"; }
  }

  // NodeMonkes can be indexed by Rarible even when generic NFT providers
  // return no metadata or an empty artwork field.
  let raribleNft = null;
  let raribleError = null;
  const raribleKey = env.RARIBLE_API_KEY;
  if ((contract === NODEMONKES || contract === NODEMONKES_POLYGON) && raribleKey && (!alchemyNft || !hasUsableImage(alchemyNft)) && !forceOpenSea) {
    try {
      const itemId = (NETWORK(contract) === "polygon" ? "POLYGON:" : "BASE:") + contract + ":" + tokenId;
      const endpoint = "https://api.rarible.org/v0.1/items/" + encodeURIComponent(itemId);
      const response = await fetch(endpoint, {headers:{"accept":"application/json","X-API-KEY":raribleKey}});
      if (response.ok) {
        const item = await response.json();
        const meta = item.meta || {};
        const content = Array.isArray(meta.content) ? meta.content : [];
        const rawImage = content.find(x => /image|video/i.test(String(x?.["@type"] || x?.type || "")) && x?.url)?.url
          || content.find(x => x?.url)?.url || meta.image?.url || meta.image || "";
        const normalized = normalizeImage(typeof rawImage === "string" ? rawImage : "");
        raribleNft = {
          name:meta.name || item.name || "",
          description:meta.description || item.description || "",
          image_url:normalized,
          metadata:{...meta,image:normalized,attributes:Array.isArray(meta.attributes) ? meta.attributes : []},
          owners:item.owners || (item.owner ? [{address:item.owner}] : []),
          creator:item.creators?.[0]?.account || item.creators?.[0]?.address || meta.creator || ""
        };
      } else raribleError = response.status;
    } catch { raribleError = "network"; }
  }

  const source = preferOpenSea
	  ? (openSeaNft ? "opensea" : null)
	  : (alchemyNft && hasUsableImage(alchemyNft)) ? "alchemy"
	    : (raribleNft && hasUsableImage(raribleNft)) ? "rarible"
	      : (openSeaNft && hasUsableImage(openSeaNft)) ? "opensea"
	        : openSeaNft ? "opensea" : raribleNft ? "rarible" : alchemyNft ? "alchemy" : null;
  if (!source) {
    const status = alchemyError === 429 || openSeaError === 429 ? 429 : 502;
    return json({
      error:status === 429 ? "NFT data provider rate limit reached. Please retry shortly." : "Live NFT detail data is temporarily unavailable.",
      source:null
    }, status, forceOpenSea);
  }

  const nft = preferOpenSea
	  ? (openSeaNft || {})
	  : (alchemyNft && hasUsableImage(alchemyNft)) ? alchemyNft
	    : (raribleNft && hasUsableImage(raribleNft)) ? raribleNft
	      : (openSeaNft || raribleNft || alchemyNft || {});
  const metadata = nft.metadata || nft.raw?.metadata || openSeaNft?.metadata || {};
  const traitsRaw = Array.isArray(nft.traits) ? nft.traits
    : Array.isArray(metadata.attributes) ? metadata.attributes
    : Array.isArray(nft.raw?.metadata?.attributes) ? nft.raw.metadata.attributes
    : Array.isArray(openSeaNft?.traits) ? openSeaNft.traits : [];
  const traits = traitsRaw.map(t => ({
    trait_type: text(t.trait_type || t.type || t.key || t.name) || "Attribute",
    value: t.value == null ? "" : String(t.value),
    display_type: text(t.display_type)
  }));
  const owner = ownerAddress(nft) || ownerAddress(openSeaNft);
  const creator = text(nft.creator?.address || nft.creator?.username || nft.creator || metadata.creator || metadata.created_by || metadata.properties?.creator || openSeaNft?.creator?.address || openSeaNft?.creator?.username);
  const rarityData = openSeaNft?.rarity || nft.rarity;
  const rarity = rarityData && typeof rarityData === "object" ? {
    rank: rarityData.rank ?? rarityData.rank_by_sales,
    score: rarityData.score ?? rarityData.statistical_score,
    source: text(rarityData.source || (openSeaNft?.rarity ? "OpenSea" : "Alchemy"))
  } : null;
  const image = normalizeImage(
    nft.image?.cachedUrl || nft.image?.originalUrl || nft.image?.thumbnailUrl ||
    nft.image_url || (typeof nft.image === "string" ? nft.image : "") ||
    metadata.image || openSeaNft?.image_url || ""
  );

  return json({
    contract, tokenId, source,
    name: text(nft.name || metadata.name || openSeaNft?.name) || "Token #" + tokenId,
    description: text(nft.description || metadata.description || openSeaNft?.description),
    image,
    owner: owner || null,
    creator: creator || null,
    traits,
    rarity,
    updatedAt: text(nft.timeLastUpdated || nft.updated_at || openSeaNft?.updated_at) || null,
    marketplaceUrl: contract === NEON_RELICS ? "/#market" : preferOpenSea ? "https://opensea.io/assets/" + NETWORK(contract) + "/" + contract + "/" + encodeURIComponent(tokenId) : "https://og.rarible.com/token/" + NETWORK(contract) + "/" + contract + ":" + encodeURIComponent(tokenId),
    dataStatus: {owner: owner ? "verified_from_indexer" : "not_provided_by_source", creator: creator ? "provided_by_source" : "not_provided_by_source", rarity: rarity ? "provided_by_source" : "not_provided_by_source"}
  }, 200, forceOpenSea);
}
