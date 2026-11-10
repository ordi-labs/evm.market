const PUNKS = "0xb9110ba3266f4983193c0d5f55c792a94368af28";
const NODEMONKES = "0x095b6ae2102094be8b5f06fac27275ddb9a8c70a";
const BYTEBEASTS = "0x7325654c657520e30c56a04225a3d9acdf895e55";
const NEXUS_LEGENDS = "0x353a98c65b427294412fae0187e551698eb1c8d6";
const NEON_RELICS = "0x64d94e792076da8df31d06e15e7ab4e152999c06";
const BASE_ODDITIES = "0x8b245812b0755b7e0259395beca3e591734660fb";
const PIXEL_NOMADS = "0x13ef1ea93602873d11a92bc434c8ed580487b2dc";
const CRYPTOPUNKS_BASE = "0x18d91b5597f1a7227d2960945c9a1417f0ff721d";
const NODEMONKES_POLYGON = "0xdf264d5da8dfaa41fa2e634afead44935af2ad66";
const ALLOWED = new Set([PUNKS, NODEMONKES, BYTEBEASTS, NEXUS_LEGENDS, NEON_RELICS, BASE_ODDITIES, PIXEL_NOMADS, CRYPTOPUNKS_BASE, NODEMONKES_POLYGON]);
const BASE_CHAIN_ID = "0x2105";
const POLYGON_CHAIN_ID = "0x89";
const networkFor = contract => contract === NODEMONKES_POLYGON ? {slug:"polygon",chainId:POLYGON_CHAIN_ID,rpcHost:"polygon-mainnet",label:"Polygon"} : {slug:"base",chainId:BASE_CHAIN_ID,rpcHost:"base-mainnet",label:"Base"};
const OWNER_OF_SELECTOR = "0x6352211e";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
  }});
}

function keyFromConfig(configured) {
  const value = String(configured || "").trim();
  if (!value) return "";
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !/\.alchemy\.com$/i.test(url.hostname) || url.username || url.password) return "";
    const parts = url.pathname.split("/").filter(Boolean);
    const version = parts.findIndex(part => part === "v2" || part === "v3");
    return version >= 0 ? parts[version + 1] || "" : "";
  } catch {
    return "";
  }
}

function getAlchemyKey(env) {
  for (const value of [env.ALCHEMY_API_KEY, env.ALCHEMY_API, env.ETHEREUM_API]) {
    const key = keyFromConfig(value);
    if (key) return key;
  }
  return "";
}

function getRpcUrl(env, key, network) {
  const configured = String(network.slug === "polygon" ? (env.POLYGON_RPC || env.POLYGON_RPC_URL || "") : (env.ETHEREUM_API || "")).trim();
  if (/^https?:\/\//i.test(configured)) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
    } catch {
      return "";
    }
    return "";
  }
  return key ? "https://" + network.rpcHost + ".g.alchemy.com/v2/" + encodeURIComponent(key) : "";
}

function decimalTokenId(value) {
  const tokenId = String(value ?? "").trim();
  if (!tokenId) return "";
  try {
    const result = BigInt(tokenId);
    return result >= 0n ? result.toString() : "";
  } catch {
    return "";
  }
}

function normalizeOwnedNft(nft, contract) {
  const tokenId = decimalTokenId(nft?.tokenId ?? nft?.token_id ?? nft?.identifier);
  if (!tokenId) return null;
  const reportedContract = String(nft?.contract?.address ?? nft?.contractAddress ?? nft?.contract_address ?? "").toLowerCase();
  if (reportedContract && reportedContract !== contract) return null;
  const raw = nft?.raw || {};
  const metadata = raw.metadata || nft?.metadata || {};
  const image = nft?.image && typeof nft.image === "object" ? nft.image : {};
  const media = Array.isArray(nft?.media) ? nft.media[0] || {} : {};
  const imageCandidates = [
    image.cachedUrl, image.thumbnailUrl, image.originalUrl, image.pngUrl,
    typeof nft?.image === "string" ? nft.image : "",
    media.gateway, media.raw, media.thumbnail, nft?.image_url, nft?.display_image_url,
    metadata.image, metadata.image_url, metadata.imageURI, metadata.imageUri
  ];
  const imageUrl = imageCandidates.find(value => typeof value === "string" && value.trim()) || "";
  const attributes = metadata.attributes || metadata.properties?.attributes || nft?.attributes || [];
  return {
    identifier: tokenId,
    token_id: tokenId,
    name: nft?.name || metadata.name || "Token #" + tokenId,
    description: nft?.description || metadata.description || "",
    image_url: imageUrl,
    display_image_url: imageUrl,
    metadata: {
      name: nft?.name || metadata.name || "",
      description: nft?.description || metadata.description || "",
      image: imageUrl,
      attributes: Array.isArray(attributes) ? attributes : []
    },
    verifiedOwner: true,
    opensea_url: contract === NODEMONKES_POLYGON
      ? "https://og.rarible.com/token/polygon/" + contract + ":" + encodeURIComponent(tokenId)
      : "https://opensea.io/assets/base/" + contract + "/" + encodeURIComponent(tokenId)
  };
}

async function rpcRequest(rpcUrl, method, params, networkLabel = "Base") {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {"content-type": "application/json", "accept": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params})
  });
  if (!response.ok) throw new Error(networkLabel + " RPC is unavailable.");
  const data = await response.json().catch(() => null);
  if (!data || data.jsonrpc !== "2.0") throw new Error(networkLabel + " RPC returned an invalid response.");
  return data;
}

async function mapLimit(values, concurrency, callback) {
  const output = new Array(values.length);
  let index = 0;
  const workers = Array.from({length: Math.min(concurrency, values.length)}, async () => {
    while (index < values.length) {
      const current = index++;
      output[current] = await callback(values[current]);
    }
  });
  await Promise.all(workers);
  return output;
}

async function ownsOnChain(rpcUrl, contract, tokenId, wallet, network) {
  const encodedId = BigInt(tokenId).toString(16).padStart(64, "0");
  const data = await rpcRequest(rpcUrl, "eth_call", [{to: contract, data: OWNER_OF_SELECTOR + encodedId}, "latest"], network.label);
  if (data.error) {
    const message = String(data.error.message || "");
    if (data.error.code === -32005 || /rate.?limit|timeout|temporarily unavailable|overloaded/i.test(message)) {
      throw new Error(network.label + " RPC ownership verification is temporarily unavailable.");
    }
    // ERC-721 ownerOf reverts for stale indexer entries, nonexistent, or burned tokens.
    return false;
  }
  const result = String(data.result || "");
  if (!/^0x[0-9a-f]{64}$/i.test(result)) return false;
  const owner = "0x" + result.slice(-40).toLowerCase();
  return owner !== ZERO_ADDRESS && owner === wallet.toLowerCase();
}

export async function onRequestGet({request, env}) {
  const url = new URL(request.url);
  const contract = String(url.searchParams.get("contract") || "").toLowerCase();
  const wallet = String(url.searchParams.get("owner") || "").trim();
  const next = String(url.searchParams.get("next") || "");
  const limit = Number(url.searchParams.get("limit") || "20");
  if (!ALLOWED.has(contract)) return json({error: "Unsupported collection contract."}, 400);
  if (!/^0x[0-9a-f]{40}$/i.test(wallet)) return json({error: "A valid connected wallet address is required."}, 400);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return json({error: "Owned NFT page size must be between 1 and 100."}, 400);
  if (next.length > 2048 || (next && !/^[A-Za-z0-9_.~+/=-]+$/.test(next))) return json({error: "Invalid ownership pagination cursor."}, 400);

  const network = networkFor(contract);
  const alchemyKey = getAlchemyKey(env);
  if (!alchemyKey) return json({error: "Alchemy NFT API is not configured on the server."}, 503);
  const rpcUrl = getRpcUrl(env, alchemyKey, network);
  if (!rpcUrl) return json({error: "A " + network.label + " mainnet RPC endpoint is not configured on the server."}, 503);

  try {
    const chain = await rpcRequest(rpcUrl, "eth_chainId", [], network.label);
    if (chain.error || String(chain.result || "").toLowerCase() !== network.chainId) {
      return json({error: "Ownership verification requires a " + network.label + " mainnet RPC endpoint (chain ID " + BigInt(network.chainId).toString() + ")."}, 503);
    }

    const endpoint = new URL("https://" + network.rpcHost + ".g.alchemy.com/nft/v3/" + encodeURIComponent(alchemyKey) + "/getNFTsForOwner");
    endpoint.searchParams.set("owner", wallet);
    endpoint.searchParams.append("contractAddresses[]", contract);
    endpoint.searchParams.set("withMetadata", "true");
    endpoint.searchParams.set("pageSize", String(limit));
    if (next) endpoint.searchParams.set("pageKey", next);
    const response = await fetch(endpoint, {headers: {"accept": "application/json"}});
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || typeof data !== "object") {
      return json({error: "Alchemy could not load this wallet's NFTs for the selected collection.", providerStatus: response.status || 502}, 502);
    }

    const candidates = (Array.isArray(data.ownedNfts) ? data.ownedNfts : Array.isArray(data.nfts) ? data.nfts : [])
      .map(nft => normalizeOwnedNft(nft, contract)).filter(Boolean);
    const checks = await mapLimit(candidates, 8, nft => ownsOnChain(rpcUrl, contract, nft.identifier, wallet, network));
    const owned = candidates.filter((_, index) => checks[index]);
    return json({
      nfts: owned,
      next: typeof data.pageKey === "string" && data.pageKey ? data.pageKey : null,
      source: "alchemy+" + network.slug + "-ownerOf",
      owner: wallet,
      verifiedCount: owned.length,
      staleCount: candidates.length - owned.length,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    return json({error: error?.message || "Could not verify NFT ownership on " + network.label + "."}, 502);
  }
}
