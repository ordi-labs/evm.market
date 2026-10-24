# evm.market

Premium Base NFT collection explorer for Base Punks and NodeMonkes. This repository is dedicated to evm.market and does not modify the existing wallet or ordinal sites.

## Collections
- Base Punks: `0xb9110ba3266f4983193c0d5f55c792a94368af28`
- NodeMonkes: `0x095b6ae2102094be8b5f06fac27275ddb9a8c70`

## Cloudflare Pages
- Project: `evm-market-premium`
- Production URL: https://evm-market-premium.pages.dev
- Source: `ordi-labs/evm.market`, branch `main`
- Build command: none; output directory: repository root (`.`)
- Add `OPENSEA_API_KEY` as a Cloudflare Pages secret in production and preview. Do not commit API keys.
- The custom domain `evm.market` is registered to the Pages project but remains pending until its CNAME DNS record points to `evm-market-premium.pages.dev`.

## Functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, external marketplace links, and injected EVM wallet connection/Base network switching.

**Trading scope:** The current app does not create or fulfill listings, offers, or purchases internally. Item links open OpenSea. Native trading requires a tested Seaport integration for listing, signatures, offers, fulfillment, and cancellation.
