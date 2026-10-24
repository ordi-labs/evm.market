const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const ALLOWED = new Set([PUNKS, NODEMONKES]);
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=15, s-maxage=30","x-content-type-options":"nosniff","access-control-allow-origin":"*"}});
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
export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = (url.searchParams.get("contract") || "").toLowerCase();
  const tokenId = (url.searchParams.get("tokenId") || "").trim();
  if (!ALLOWED.has(contract)) return json({error:"Unsupported collection contract."}, 400);
  if (!tokenId || tokenId.length > 100 || !/^[0-9]+$/.test(tokenId)) return json({error:"A numeric tokenId is required."}, 400);

  // Alchemy is the primary metadata source for both Base Punks and NodeMonkes.
  let alchemyNft = null;
  let alchemyError = null;
  const configured = env.ALCHEMY_API_KEY || env.ALCHEMY_API || env.ETHEREUM_API;
  if (configured) {
    try {
      const key = alchemyKeyFromConfig(configured);
      const endpoint = new URL("https://base-mainnet.g.alchemy.com/nft/v3/" + encodeURIComponent(key) + "/getNFTMetadata");
      endpoint.searchParams.set("contractAddress", contract);
      endpoint.searchParams.set("tokenId", tokenId);
      endpoint.searchParams.set("refreshCache", "false");
      const response = await fetch(endpoint, {headers: {"accept":"application/json"}});
      if (response.ok) alchemyNft = await response.json();
      else alchemyError = response.status;
    } catch { alchemyError = "network"; }
  }

  // Keep OpenSea as a server-side fallback if Alchemy cannot return this NFT.
  let openSeaNft = null;
  let openSeaError = null;
  const apiKey = env.OPENSEA_API || env.OPENSEA_API_KEY;
  if (!alchemyNft && apiKey) {
    try {
      const endpoint = new URL("https://api.opensea.io/api/v2/chain/base/contract/" + contract + "/nfts/" + encodeURIComponent(tokenId));
      const response = await fetch(endpoint, {headers: {"accept":"application/json", "x-api-key":apiKey}});
      if (response.ok) {
        const data = await response.json();
        openSeaNft = data.nft || data;
      } else openSeaError = response.status;
    } catch { openSeaError = "network"; }
  }

  const source = alchemyNft ? "alchemy" : openSeaNft ? "opensea" : null;
  if (!source) {
    const status = alchemyError === 429 || openSeaError === 429 ? 429 : 502;
    return json({
      error:status === 429 ? "NFT data provider rate limit reached. Please retry shortly." : "Live NFT detail data is temporarily unavailable.",
      source:null
    }, status);
  }

  const nft = alchemyNft || openSeaNft || {};
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
    marketplaceUrl: "https://og.rarible.com/token/base/" + contract + ":" + encodeURIComponent(tokenId),
    dataStatus: {owner: owner ? "verified_from_indexer" : "not_provided_by_source", creator: creator ? "provided_by_source" : "not_provided_by_source", rarity: rarity ? "provided_by_source" : "not_provided_by_source"}
  });
}
