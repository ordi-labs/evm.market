import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFile} from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const priceHelpersStart = html.indexOf("function parsePriceRange(");
const priceHelpersEnd = html.indexOf("function render()", priceHelpersStart);
const priceHelpers = vm.runInNewContext(`${html.slice(priceHelpersStart, priceHelpersEnd)}; ({parsePriceRange, matchesPriceRange})`);
const normalizeStart = html.indexOf("function normalizeTraitCatalog(data){");
const normalizeEnd = html.indexOf("function updateTraitValueOptions", normalizeStart);
const normalizeTraitCatalog = vm.runInNewContext(`${html.slice(normalizeStart, normalizeEnd)}; normalizeTraitCatalog`, {Map});
test("trait filter fails closed when item attributes are missing", () => {
  assert.match(html, /if\(traitType&&traitValue\)\{const attrs=traitPairs\(n\);if\(!attrs\.some\(t=>t\.type===traitType&&t\.value===traitValue\)\)return false\}/);
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
test("refresh explicitly restarts an exhausted but incomplete collection scan", () => {
  assert.match(html, /if\(complete\|\|!restartIncomplete\)return/);
  assert.match(html, /scanTraitIndex\(\{contract,restartIncomplete,/);
  assert.match(html, /ensureFullTraitIndex\(contract,\{restartIncomplete:true\}\)/);
});
test("Reown mobile connect waits for AppKit provider/account events and survives wallet app switching", () => {
  assert.match(html, /function waitForReownProvider\(appKit,timeoutMs=180000\)/);
  assert.match(html, /appKit\.subscribeProviders/);
  assert.match(html, /appKit\.subscribeAccount/);
  assert.match(html, /document\.addEventListener\("visibilitychange",onVisibilityChange\)/);
  assert.match(html, /walletConnectProvider=await waitForReownProvider\(appKit\)/);
  assert.doesNotMatch(html, /for\(let attempt=0;attempt<120;attempt\+\+\)/);
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
  assert.match(html, /if\(!polygon&&listingFilter\.value==="listed"&&\(!listing\|\|listing===false\|\|listing==="loading"\|\|listing\.error\)\)return false/);
  assert.doesNotMatch(html, /const price=listingPrice\(order\);if\(!price\)continue/);
});
test("NFT cards show live Rarible prices for Polygon instead of a generic marketplace label", () => {
  assert.match(html, /loadLiveListing\(n,contract\);const listing=activeListing\(n\);price\.textContent=listing\?\.price\?/);
  assert.match(html, /raribleListingPrice\(order\)/);
  assert.match(html, /Loading POL price…/);
  assert.doesNotMatch(html, /Live Polygon data · Rarible marketplace · listings external/);
});

test("owned view is exposed as a wallet-scoped mode for all configured collections", () => {
  assert.match(html, /id="ownedByMe"/);
  assert.match(html, /requestedOwned\?"\/api\/owned"/);
  assert.match(html, /ownedByMe/);
});


test("CryptoPunks [Base], Nexus//Legends and NodeMonkes Polygon are selectable with verified contracts", () => {
  assert.match(html, /data-collection="cryptopunksbase"/);
  assert.match(html, /name:"CryptoPunks \[Base\]",contract:"0x18d91b5597f1a7227d2960945c9a1417f0ff721d",slug:"cryptopunks-base",network:"base"/);
  assert.match(html, /data-collection="nodemonkespolygon"/);
  assert.match(html, /name:"NodeMonkes \[Polygon\]",contract:"0xdf264d5da8dfaa41fa2e634afead44935af2ad66",slug:"",network:"polygon"/);
  assert.match(html, /Nine collections/);
  assert.match(html, /data-collection="neonrelics"/);
  assert.match(html, /name:"Neon Relics",contract:"0x64d94e792076da8df31d06e15e7ab4e152999c06",slug:"",network:"base"/);
  assert.match(html, /usesExternalMarketplace/);
  assert.match(html, /if\(selected==="neonrelics"\)return "#market"/);
  assert.match(html, /data-collection="baseoddities"/);
  assert.match(html, /data-collection="pixelnomads"/);
  assert.match(html, /name:"Base Oddities",contract:"0x8b245812b0755b7e0259395beca3e591734660fb",slug:"base-oddities",network:"base"/);
  assert.match(html, /name:"Pixel Nomads",contract:"0x13ef1ea93602873d11a92bc434c8ed580487b2dc",slug:"pixel-nomads-783494962",network:"base"/);
  assert.match(html, /chainId:"0x89"/);
  assert.match(html, /api\/polygon-rpc/);
});

test("live ETH/WETH price filters accept inclusive configurable bounds and exclude other currencies", () => {
  const {parsePriceRange, matchesPriceRange} = priceHelpers;
  const range = parsePriceRange("0.05", "0.20");
  assert.equal(range.active, true);
  assert.equal(range.valid, true);
  assert.equal(range.min, 0.05);
  assert.equal(range.max, 0.20);
  assert.equal(matchesPriceRange({price: {value: 0.05, currency: "ETH"}}, range), true);
  assert.equal(matchesPriceRange({price: {value: 0.20, currency: "WETH"}}, range), true);
  assert.equal(matchesPriceRange({price: {value: 0.049, currency: "ETH"}}, range), false);
  assert.equal(matchesPriceRange({price: {value: 0.10, currency: "USDC"}}, range), false);
  assert.equal(matchesPriceRange(false, range), false);
});

test("live price bounds validate empty, one-sided, reversed and negative ranges", () => {
  const {parsePriceRange} = priceHelpers;
  assert.equal(parsePriceRange("", "").active, false);
  assert.equal(parsePriceRange("0.1", "").valid, true);
  assert.equal(parsePriceRange("", "0.5").valid, true);
  assert.equal(parsePriceRange("0.5", "0.1").valid, false);
  assert.equal(parsePriceRange("-0.1", "1").valid, false);
});

test("live price controls load the collection-wide feed and remain Base-only", () => {
  assert.match(html, /id="priceMinFilter" class="price-input" type="number" min="0" step="any"/);
  assert.match(html, /id="priceMaxFilter" class="price-input" type="number" min="0" step="any"/);
  assert.match(html, /priceRangeActive&&priceRange\.valid/);
  assert.match(html, /priceMinFilter"\)\.disabled=polygon/);
  assert.match(html, /renderItems\.push\(\{token_id:String\(id\),name:"Token #"\+String\(id\),metadata:\{\}\}\)/);
});

test("enables owner listing controls for Base collections and excludes NodeMonkes Polygon", () => {
  assert.match(html, /function supportsListingActions\(contract\)\{return !isPolygonCollection\(contract\)\}/);
  assert.match(html, /function loadWalletListings\(contract,id\)/);
  assert.match(html, /Unlist my Seaport listing/);
  assert.match(html, /owner===true&&supportsListingActions\(contract\)/);
});
test("wallet connector only exposes WalletConnect on Base and Polygon with live-domain metadata", async () => {
  const app = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(app, /const networks = \[base, polygon\]/);
  assert.match(app, /enableInjected: false/);
  assert.match(app, /allWallets: 'ONLY_MOBILE'/);
  assert.match(app, /connectMethodsOrder: \['wallet'\]/);
  assert.match(app, /WagmiAdapter/);
  assert.match(app, /const appUrl = window\.location\.origin/);
  assert.match(html, /appKit\.open\(\{view:"ConnectingWalletConnect"\}\)/);
  assert.match(html, /data-collection\]"\)\.forEach\(b=>b\.addEventListener\("click",async/);
  assert.match(html, /await ensureWalletForContract\(COLLECTIONS\[selected\]\.contract\)/);
});
test("English live market dashboard shows the five requested metrics for every collection", () => {
  for (const label of ["Floor Price", "24h Volume", "Total Volume", "Market Cap*", "Holders"]) assert.ok(html.includes(`<th>${label}</th>`));
  assert.match(html, /function initializeMarketDashboard\(\)/);
  assert.match(html, /Object\.entries\(COLLECTIONS\)/);
  assert.match(html, /collection-stats&contract=/);
  assert.match(html, /Floor-based estimate/);
  assert.match(html, /setInterval\(\(\)=>\{if\(document\.visibilityState==="visible"\)refreshMarketDashboard\(\)\},60000\)/);
});


test("wallet connection requests a readable domain-bound personal message signature", () => {
  assert.match(html, /provider\.request\(\{method:"eth_requestAccounts"\}\)/);
  assert.match(html, /method:"personal_sign"/);
  assert.match(html, /Chain ID: 8453/);
  assert.match(html, /Expiration Time:/);
  assert.match(html, /window\.__verifyMessage/);
  assert.match(html, /The site signature was approved/);
});
