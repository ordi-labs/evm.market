const ALLOWED_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_getCode",
  "eth_getBalance"
]);
const POLYGON_CHAIN_ID = "0x89";
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'"
}});

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function getRpcUrl(env) {
  const configured = String(env.POLYGON_RPC || env.POLYGON_RPC_URL || "").trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" && !url.username && !url.password) return url.toString();
    } catch { return ""; }
    return "";
  }
  for (const value of [env.ALCHEMY_API_KEY, env.ALCHEMY_API, env.ETHEREUM_API]) {
    const candidate = String(value || "").trim();
    if (!candidate) continue;
    if (!/^https?:\/\//i.test(candidate)) return "https://polygon-mainnet.g.alchemy.com/v2/" + encodeURIComponent(candidate);
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || !/\.alchemy\.com$/i.test(url.hostname) || url.username || url.password) continue;
      const segments = url.pathname.split("/").filter(Boolean);
      const version = segments.findIndex(part => part === "v2" || part === "v3");
      if (version >= 0 && segments[version + 1]) return "https://polygon-mainnet.g.alchemy.com/v2/" + encodeURIComponent(segments[version + 1]);
    } catch { /* Try the next configured Alchemy setting. */ }
  }
  return "";
}

function validAddress(value) { return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value); }
function validateParams(method, params) {
  if (!Array.isArray(params)) throw new Error("JSON-RPC params must be an array.");
  if (method === "eth_call") {
    if (!params[0] || typeof params[0] !== "object" || !validAddress(params[0].to)) throw new Error("eth_call requires a valid target address.");
    if (params[0].data != null && (typeof params[0].data !== "string" || !/^0x[0-9a-f]*$/i.test(params[0].data) || params[0].data.length > 131074)) throw new Error("Invalid eth_call data.");
    if (params.length > 2) throw new Error("Unsupported eth_call parameters.");
  } else if (method === "eth_getTransactionReceipt" || method === "eth_getTransactionByHash") {
    if (params.length !== 1 || typeof params[0] !== "string" || !/^0x[0-9a-f]{64}$/i.test(params[0])) throw new Error("A valid transaction hash is required.");
  } else if (method === "eth_getCode" || method === "eth_getBalance") {
    if (params.length < 1 || params.length > 2 || !validAddress(params[0])) throw new Error(method + " requires a valid address.");
  } else if (params.length !== 0) throw new Error(method + " does not accept parameters.");
  return params;
}

export async function onRequestPost({request, env}) {
  if (!sameOrigin(request)) return json({error: "Same-origin request required."}, 403);
  let body;
  try { body = await request.json(); } catch { return json({error: "Request body must be valid JSON."}, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !Number.isSafeInteger(body.id) || body.id < 0 || body.jsonrpc !== "2.0") return json({error: "Invalid JSON-RPC request."}, 400);
  const method = body.method;
  if (typeof method !== "string" || !ALLOWED_METHODS.has(method)) return json({error: "Polygon RPC method is not allowed. Transactions must be signed and submitted by the connected wallet."}, 400);
  let params;
  try { params = validateParams(method, body.params ?? []); } catch (error) { return json({error: error.message}, 400); }
  const rpcUrl = getRpcUrl(env);
  if (!rpcUrl) return json({error: "Configure POLYGON_RPC or an Alchemy API key for Polygon read-only RPC calls."}, 503);
  try {
    const chainResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: {"content-type": "application/json", "accept": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: body.id, method: "eth_chainId", params: []})
    });
    const chainPayload = await chainResponse.json().catch(() => null);
    if (!chainResponse.ok || String(chainPayload?.result || "").toLowerCase() !== POLYGON_CHAIN_ID) return json({error: "Configured Polygon RPC is not responding as Polygon mainnet (chain ID 137)."}, 503);
    const upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: {"content-type": "application/json", "accept": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: body.id, method, params})
    });
    const text = await upstream.text();
    let result;
    try { result = JSON.parse(text); } catch { return json({error: "Invalid response from Polygon RPC provider."}, 502); }
    if (!upstream.ok || result.error) return json({error: "Polygon RPC request failed.", providerStatus: upstream.status || 502, details: result.error?.message || null, id: body.id, jsonrpc: "2.0"}, 502);
    return json({jsonrpc: "2.0", id: body.id, result: result.result ?? null});
  } catch {
    return json({error: "Polygon RPC provider is temporarily unavailable."}, 502);
  }
}
