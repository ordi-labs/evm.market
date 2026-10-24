# evm.market

A premium, responsive collection explorer for Base Punks and NodeMonkes on Base. This repository is dedicated to evm.market and does not modify any other sites.

## Collections
- Base Punks: `0xb9110ba3266f4983193c0d5f55c792a94368af28`
- NodeMonkes: `0x095b6ae2102094be8b5f06fac27275ddb9a8c70`

## Cloudflare Pages
- Connect `ordi-labs/evm.market` to its own Pages project.
- Build command: none; output directory: repository root.
- Add `OPENSEA_API_KEY` as a Pages secret for production and preview environments. Never commit API keys.
- Deploy and verify `/api/nfts?contract=0xb9110ba3266f4983193c0d5f55c792a94368af28&limit=20`.

## Current functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, external marketplace links, and injected EVM wallet connection/Base network switching.

**Trading scope:** This version does not create or fulfill listings, bids/offers, or purchases inside the app. Item links open OpenSea. Native trading requires a tested Seaport integration for listing, signatures, offers, fulfillment and cancellation; don't present those flows as enabled until implemented and tested.
