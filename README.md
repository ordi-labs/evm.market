# evm.market

Premium EVM NFT collection explorer for Base and Polygon. This repository is dedicated to evm.market and does not modify the existing wallet or ordinal sites.

## Collections
- Base Punks — Base: `0xb9110ba3266f4983193c0d5f55c792a94368af28` (`punks-base-1`)
- NodeMonkes — Base: `0x095b6ae2102094be8b5f06fac27275ddb9a8c70a` (`nodemonkes`)
- BYTEBEASTS — Base: `0x7325654c657520e30c56a04225a3d9acdf895e55` (`bytebeasts-base`)
- NEXUS//LEGENDS — Base: `0x353a98c65b427294412fae0187e551698eb1c8d6` (`nexus-legends-603687376`)
- Neon Relics — Base: `0x64d94e792076da8df31d06e15e7ab4e152999c06` `https://rarible.com/collection/base/0x64d94e792076da8df31d06e15e7ab4e152999c06`
- Base Oddities — Base: `0x8b245812b0755b7e0259395beca3e591734660fb` (`base-oddities`)
- Pixel Nomads — Base: `0x13ef1ea93602873d11a92bc434c8ed580487b2dc` (`pixel-nomads-783494962`)
- CryptoPunks [Base] — Base: `0x18d91b5597f1a7227d2960945c9a1417f0ff721d` (`cryptopunks-base`)
- NodeMonkes [Polygon] — Polygon: `0xdf264d5da8dfaa41fa2e634afead44935af2ad66` (Rarible collection)

## Cloudflare Pages
- Project: `evm-market-premium`
- Production URL: https://evm-market-premium.pages.dev
- Source: `ordi-labs/evm.market`, branch `main`
- Build command: none; output directory: repository root (`.`)
- Configure `ETHEREUM_API` as a Cloudflare Pages secret for Base-compatible HTTPS RPC reads. `/api/rpc` checks for Base mainnet and permits only its configured methods; it never exposes the endpoint to the browser.
- Polygon NFT browsing and ownership checks use Alchemy's Polygon mainnet NFT/RPC endpoints. Configure `ALCHEMY_API_KEY` (or `ALCHEMY_API`) as a Pages secret; alternatively, set `POLYGON_RPC` to an HTTPS Polygon mainnet JSON-RPC endpoint. The `/api/polygon-rpc` route checks chain ID 137 and allows only read methods; transaction submission remains in the connected wallet.
- `OPENSEA_API_KEY` must remain a Cloudflare Pages secret. Never commit API keys.

## Functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, live OpenSea ETH/WETH minimum/maximum price filtering with ascending/descending price sorting for Base collections, full-collection trait indexing for all nine configured collections, exact wallet ownership checks, Reown AppKit / WalletConnect, and explicit Base or Polygon network selection. OpenSea provides the Base collection feeds; Alchemy provides the Polygon NodeMonkes feed. NFT cards link to Rarible on Polygon.

## Marketplace and protocol scope
The eight Base collections use OpenSea's Seaport 1.6 listing, offer, fulfillment, and cancellation routes on Base. NodeMonkes [Polygon] also supports Seaport 1.6 write actions on Polygon (chain ID 137), with POL/MATIC or Polygon WETH (`0x7ceb23fd6bc0add59e62ac25578270cff1b9f619`) as listing currencies and Polygon WETH for offers. The API key stays server-side; every approval, signature, purchase, or cancellation is reviewed and authorized by the user's connected wallet.

Rarible is currently provided as the Polygon collection and NFT destination; Rarible orders are not queried or executed in-app. No OpenSea collection slug has been verified for the Polygon contract, so the site does not fabricate a collection-wide OpenSea orderbook or listing status. The in-app Buy action relies on OpenSea's live item listing feed; if no supported OpenSea order is returned, the user is directed to Rarible. OpenSea listing and offer creation are separate Seaport actions and remain subject to the provider's support and the wallet's explicit prompts.
