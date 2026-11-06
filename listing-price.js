const BASE_NATIVE = "0x0000000000000000000000000000000000000000";
const BASE_WETH = "0x4200000000000000000000000000000000000006";

function currencyLabel(value) {
  const raw = typeof value === "object" && value !== null
    ? value.symbol || value.name || value.address || value.token || ""
    : value;
  const currency = String(raw || "").trim();
  if (currency.toLowerCase() === BASE_NATIVE) return "ETH";
  if (currency.toLowerCase() === BASE_WETH) return "WETH";
  return currency || "ETH";
}

function decimalStringToNumber(value, decimals) {
  const raw = String(value ?? "").trim();
  if (/^[0-9]+(?:\.[0-9]+)?e[+-]?[0-9]+$/i.test(raw)) {
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) return null;
  if (raw.includes(".")) {
    const number = Number(raw);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  try {
    const units = BigInt(raw);
    if (units <= 0n) return null;
    const base = 10n ** BigInt(decimals);
    const whole = units / base;
    const fraction = (units % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    const number = Number(fraction ? whole.toString() + "." + fraction : whole.toString());
    return Number.isFinite(number) && number > 0 ? number : null;
  } catch {
    return null;
  }
}

function decimalsFor(currency, explicit) {
  const value = Number(explicit);
  if (Number.isInteger(value) && value >= 0 && value <= 36) return value;
  if (["ETH", "WETH", BASE_NATIVE, BASE_WETH].includes(String(currency).toUpperCase()) || [BASE_NATIVE, BASE_WETH].includes(String(currency).toLowerCase())) return 18;
  return null;
}

export function listingPrice(order) {
  const sources = [
    order?.price?.current,
    order?.price_per_item,
    order?.pricePerItem,
    order?.price,
    order?.price != null && typeof order.price !== "object" ? {value: order.price, currency: order.currency} : null,
    order?.current_price != null ? {value: order.current_price, currency: order.currency} : null
  ].filter(value => value && typeof value === "object");
  for (const price of sources) {
    const raw = price.value ?? price.amount ?? price.current_price;
    if (raw == null) continue;
    const currency = currencyLabel(price.currency ?? order?.currency ?? order?.payment_token);
    const decimals = decimalsFor(currency, price.decimals ?? order?.price?.decimals ?? order?.decimals);
    const value = decimalStringToNumber(raw, decimals);
    if (value != null) return {value, currency};
  }

  const parameters = order?.protocol_data?.parameters || order?.protocolData?.parameters || order?.parameters || {};
  const consideration = Array.isArray(parameters.consideration) ? parameters.consideration : [];
  const payments = consideration.filter(item => Number(item?.itemType) !== 2);
  if (!payments.length) return null;
  const tokenAddresses = [...new Set(payments.map(item => String(item?.token || "").toLowerCase()))];
  if (tokenAddresses.length !== 1) return null;
  const token = tokenAddresses[0];
  const currency = currencyLabel(token || order?.currency);
  const decimals = decimalsFor(currency, payments[0]?.decimals);
  if (decimals == null) return null;
  try {
    const total = payments.reduce((sum, item) => {
      const amount = String(item?.endAmount ?? item?.startAmount ?? "");
      if (!/^\d+$/.test(amount)) throw new Error("Invalid payment amount");
      return sum + BigInt(amount);
    }, 0n);
    if (total <= 0n) return null;
    const base = 10n ** BigInt(decimals);
    const whole = total / base;
    const fraction = (total % base).toString().padStart(decimals, "0").replace(/0+$/, "");
    const value = Number(fraction ? whole.toString() + "." + fraction : whole.toString());
    return Number.isFinite(value) && value > 0 ? {value, currency} : null;
  } catch {
    return null;
  }
}
