import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const normalizeStart = html.indexOf("function normalizeTraitCatalog(data){");
const normalizeEnd = html.indexOf("function updateTraitValueOptions", normalizeStart);
const normalizeTraitCatalog = vm.runInNewContext(`${html.slice(normalizeStart, normalizeEnd)}; normalizeTraitCatalog`, {Map});
test("trait filter fails closed when item attributes are missing", () => {
  assert.match(html, /if\(traitType&&traitValue\)\{const attrs=traitPairs\(n\);if\(!attrs\.some\(t=>t\.type===traitType&&t\.value===traitValue\)\)return false;\}/);
});
test("trait catalog loads collection facets instead of only the current page", () => {
  assert.match(html, /scanTraitIndex\(/);
  assert.match(html, /nftTraits/);
  assert.match(html, /function updateTraitValueOptions\(\)/);
  assert.match(html, /function updateTraitTypeOptions\(\)/);
});
test("collection trait filters are enabled only after all 10,000 NFTs are indexed", () => {
  assert.match(html, /coverageComplete&&nfts\.length===COLLECTION_SUPPLY/);
  assert.match(html, /nfts\.length===COLLECTION_SUPPLY/);
  assert.match(html, /items=indexed;nextCursor=null;render\(\)/);
  assert.match(html, /list\.slice\(\(page-1\)\*PAGE_SIZE,page\*PAGE_SIZE\)/);
  assert.match(html, /value\.count\/COLLECTION_SUPPLY\*100/);
});
test("trait catalog retains every array value and its count from collection facets", () => {
  const result = normalizeTraitCatalog({traits:[
    {trait_type:"Skin Tone",values:[{value:"Tone 1",count:10},{value:"Tone 2",count:9},{value:"Tone 3",count:8},{value:"Tone 4",count:7},{value:"Tone 5",count:6},{value:"Tone 6",count:5},{value:"Tone 7",count:4}]},
    {trait_type:"Sex",trait_values:[{value:"Male",count:6},{value:"Female",count:5},{value:"Nonbinary",count:4},{value:"Other",count:3},{value:"Unknown",count:2}]}
  ]});
  assert.equal(result.find(x=>x.type==="Skin Tone").values.length,7);
  assert.equal(result.find(x=>x.type==="Sex").values.length,5);
  assert.equal(result.find(x=>x.type==="Sex").values.find(x=>x.value==="Male").count,6);
});
test("categories/counts facets retain array entries instead of treating them as numeric indexes", () => {
  const result = normalizeTraitCatalog({traits:{categories:{Skin:"string"},counts:{Skin:[{value:"Light",count:4},{value:"Medium",count:3},{value:"Dark",count:2}]}}});
  assert.deepEqual(Array.from(result[0].values, x=>x.value),["Light","Medium","Dark"]);
});
test("the complete local index counts each NFT once for each trait value", () => {
  const result = normalizeTraitCatalog({nftTraits:{
    "1":[{trait_type:"Sex",value:"Female"},{trait_type:"Sex",value:"Female"}],
    "2":[{trait_type:"Sex",value:"Female"}],
    "3":[{trait_type:"Sex",value:"Male"}]
  }});
  assert.equal(result[0].values.find(x=>x.value==="Female").count,2);
  assert.equal(result[0].values.find(x=>x.value==="Male").count,1);
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
