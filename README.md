# evm.market

Premium Base NFT collection explorer for Base Punks and NodeMonkes. This repository is dedicated to evm.market and does not modify the existing wallet or ordinal sites.

## Collections
- Base Punks: \`0xb9110ba3266f4983193c0d5f55c792a94368af28\`
- NodeMonkes: \`0x095b6ae2102094be8b5f06fac27275ddb9a8c70a\`

## Cloudflare Pages
- Project: \`evm-market-premium\`
- Production URL: https://evm-market-premium.pages.dev
- Source: \`ordi-labs/evm.market\`, branch \`main\`
- Build command: none; output directory: repository root (\`.\`)
- Configure \`ALCHEMY_API\` (or \`ALCHEMY_API_KEY\` / \`ETHEREUM_API\`) as a Cloudflare Pages secret in production and preview. Both collections now use Alchemy's Base NFT API as the primary source.
- \`OPENSEA_API\` / \`OPENSEA_API_KEY\` remains server-side and may be used as a fallback for individual NFT detail requests. Never commit API keys.

## Functionality
Responsive collection browsing, contract allowlisting, search, cursor pagination, external marketplace links, and injected EVM wallet connection/Base network switching.

**Trading scope:** The current app does not create or fulfill listings, offers, or purchases internally. Item links remain external marketplace links. Native trading requires a tested Seaport integration for listing, signatures, offers, fulfillment, and cancellation.
