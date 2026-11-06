import test from "node:test";
import assert from "node:assert/strict";
import {listingPrice} from "../listing-price.js";

test("parses nested OpenSea price.current values using their decimals", () => {
  assert.deepEqual(listingPrice({price: {current: {currency: "ETH", decimals: 18, value: "500000000000000"}}}), {value: 0.0005, currency: "ETH"});
});

test("uses decimals on the top-level price object when current is absent", () => {
  assert.deepEqual(listingPrice({price: {currency: "WETH", decimals: 18, value: "1200000000000000"}}), {value: 0.0012, currency: "WETH"});
});

test("keeps positive low-priced ETH listings instead of applying a fiat floor", () => {
  const parsed = listingPrice({current_price: "1000000000000", currency: "ETH"});
  assert.deepEqual(parsed, {value: 0.000001, currency: "ETH"});
});

test("parses Seaport consideration amounts and normalizes the Base native token", () => {
  assert.deepEqual(listingPrice({protocol_data: {parameters: {consideration: [
    {itemType: 0, token: "0x0000000000000000000000000000000000000000", endAmount: "2500000000000000"}
  ]}}}), {value: 0.0025, currency: "ETH"});
});

test("parses a positive numeric price field without applying a floor", () => {
  assert.deepEqual(listingPrice({price: 0.0000001, currency: "ETH"}), {value: 0.0000001, currency: "ETH"});
});

test("returns no parsed price for unsupported currencies without decimals", () => {
  assert.equal(listingPrice({price: {currency: "UNKNOWN", value: "1000"}}), null);
});
