# evm.market

Premium Base NFT collection explorer for Base Punks and NodeMonkes. This repository is dedicated to evm.market and does not modify the existing wallet or ordinal sites.

## Collections
- Base Punks: 0xb9110ba3266f4983193c0d5f55c792a94368af28
- NodeMonkes: 0x095b6ae2102094be8b5f06fac27275ddb9a8c70a

## Cloudflare Pages
- Project: evm-market-premium
- Production URL: https://evm-market-premium.pages.dev
- Source: ordi-labs/evm.market, branch main
- Build command: none; output directory: repository root (.)
- Configure `ALCHEMY_API_KEY` (or `ALCHEMY_API` / `ETHEREUM_API`) as a Cloudflare Pages secret in production and preview. These values are used server-side for Alchemy NFT data and the read-only Base RPC proxy at `/api/rpc`; the key is never sent to the browser.
- OPENSEA_API / OPENSEA_API_KEY must remain a Cloudflare Pages secret and may be used for NFT metadata and the server-side trade API. Never commit API keys.

## Functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, injected EVM wallet connection, and Base network switching.

## Seaport integration status
A server-side foundation is being prepared in `functions/api/trade.js`:
- Uses the OpenSea API from Cloudflare Pages Functions, keeping the API key out of browser code.
- Restricts trade API calls to Base (`base`) and the two allowlisted collection contracts.
- Supports reading listing/offer data and submitting an already wallet-signed listing/offer payload after basic structure, signature-format, contract, and token-ID validation.

**Native trading is partially implemented and must not be considered production-ready until live Base tests pass.** Buy prepares an OpenSea Seaport fulfillment transaction and asks the connected wallet to send it; listing uses OpenSea listing actions and wallet signing/approval. Make Offer remains a validated draft only. The `/api/rpc` endpoint uses the configured Alchemy Base API for read-only ownership checks and transaction receipt confirmation. It explicitly blocks transaction submission methods: the user wallet must approve and submit every transaction. Configure `OPENSEA_API` or `OPENSEA_API_KEY` and `BASE_SEAPORT_ADDRESS` as Cloudflare Pages secrets before exercising write endpoints. `BASE_SEAPORT_ADDRESS` must be the verified Seaport contract address for Base; the route fails closed if it is missing.
