const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;

function safeImageUrl(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
  if (!host || host.includes(":") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (parts.some(n => n > 255) || parts[0] === 10 || parts[0] === 127 ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) || parts[0] === 0) return null;
  }
  return url;
}

export async function onRequestGet({request}) {
  const requestUrl = new URL(request.url);
  const input = requestUrl.searchParams.get("url") || "";
  let target = safeImageUrl(input);
  if (!target) return new Response("Invalid image URL.", {status:400, headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});

  try {
    let upstream;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      upstream = await fetch(target.toString(), {
        headers: {"accept":"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"},
        redirect: "manual"
      });
      if (upstream.status >= 300 && upstream.status < 400) {
        const location = upstream.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) return new Response("Image redirect limit reached.", {status:502});
        target = safeImageUrl(new URL(location, target).toString());
        if (!target) return new Response("Blocked image redirect.", {status:502, headers:{"x-content-type-options":"nosniff"}});
        continue;
      }
      break;
    }

    if (!upstream || !upstream.ok) return new Response("Image source unavailable.", {status:502, headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
    const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/") || type === "image/svg+xml") {
      return new Response("Upstream did not return a supported raster image.", {status:415, headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
    }
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_IMAGE_BYTES) return new Response("Image exceeds size limit.", {status:413});
    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new Response("Image exceeds size limit.", {status:413});
    return new Response(bytes, {status:200, headers:{
      "content-type":type,
      "content-length":String(bytes.byteLength),
      "cache-control":"public, max-age=3600, s-maxage=86400",
      "x-content-type-options":"nosniff",
      "cross-origin-resource-policy":"same-origin"
    }});
  } catch {
    return new Response("Image source could not be reached.", {status:502, headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
  }
}
