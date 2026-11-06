import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
test("trait filter fails closed when item attributes are missing", () => {
  assert.match(html, /if\(traitType&&traitValue\)\{const attrs=traitPairs\(n\);if\(!attrs\.some\(t=>t\.type===traitType&&t\.value===traitValue\)\)return false;\}/);
});
test("trait catalog loads collection facets instead of only the current page", () => {
  assert.match(html, /\/api\/traits\?contract=/);
  assert.match(html, /nftTraits/);
});
test("a positive active listing is kept even if its price could not be parsed", () => {
  assert.match(html, /if\(status==="listed"&&\(!listing\|\|listing===false\|\|listing==="loading"\|\|listing\.error\)\)return false;/);
  assert.doesNotMatch(html, /const price=listingPrice\(order\);if\(!price\)continue/);
});

test("owned view is exposed as a wallet-scoped mode for the three configured collections", () => {
  assert.match(html, /id="ownedByMe"/);
  assert.match(html, /requestedOwned\?"\/api\/owned"/);
  assert.match(html, /ownedByMe/);
});
