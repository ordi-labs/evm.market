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
- Configure ALCHEMY_API (or ALCHEMY_API_KEY / ETHEREUM_API) as a Cloudflare Pages secret in production and preview. Both collections use Alchemy's Base NFT API as the primary source.
- OPENSEA_API / OPENSEA_API_KEY must remain a Cloudflare Pages secret and may be used for NFT metadata and the server-side trade API. Never commit API keys.

## Functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, injected EVM wallet connection, and Base network switching.

## Seaport integration status
A server-side foundation is being prepared in `functions/api/trade.js`:
- Uses the OpenSea API from Cloudflare Pages Functions, keeping the API key out of browser code.
- Restricts trade API calls to Base (`base`) and the two allowlisted collection contracts.
- Supports reading listing/offer data and submitting an already wallet-signed listing/offer payload after basic structure, signature-format, contract, and token-ID validation.

**This is not yet a complete native marketplace UI.** The current Buy/Sell/List/Make Offer buttons remain external links until the frontend can safely create and review EIP-712 Seaport orders, display payment/fee/expiry/recipient details, execute fulfillment transactions through the connected wallet, handle cancellation and approval scope, and pass end-to-end tests. Do not treat this branch as production-enabled trading. Configure `OPENSEA_API` or `OPENSEA_API_KEY` and `BASE_SEAPORT_ADDRESS` in Cloudflare Pages secrets before exercising write endpoints. `BASE_SEAPORT_ADDRESS` must be the verified Seaport contract address for Base; the route fails closed if it is missing.
