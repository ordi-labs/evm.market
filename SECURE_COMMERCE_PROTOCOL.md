# Secure commerce protocol — evm.market

## Scope and current trading model

evm.market is a collection explorer for Base Punks (`0xb9110ba3266f4983193c0d5f55c792a94368af28`) and NodeMonkes (`0x095b6ae2102094be8b5f06fac27275ddb9a8c70a`). The current UI links to an external marketplace; it does **not** yet create, sign, fulfill, or cancel orders itself. Never represent an external link as an in-app purchase or claim an order is verified merely because a wallet is connected.

Use established marketplace infrastructure (OpenSea-supported Seaport on Base) rather than deploying a custom unaudited exchange contract.

## Required security invariants

1. **Network:** Base mainnet only (`chainId 8453 / 0x2105`) for these collection actions. Re-check chain immediately before every signing or transaction request.
2. **Collection allowlist:** only the two contract addresses above are supported. Never trust a contract address from a query string or external marketplace metadata without comparing it to the allowlist.
3. **Wallet safety:** never request seed phrases or private keys; never send them to a server. Order signatures and transactions must be initiated in the user's wallet after explicit action.
4. **Clear transaction review:** before a signature/transaction, display and validate collection, token ID, maker/taker, recipient, payment token, total price, fees, expiration, nonce/order hash, conduit/operator and approval scope. Reject unsupported currencies, unexpected recipients, expired orders and mismatched chain IDs.
5. **Ownership:** owner reads are point-in-time hints. Re-check on-chain ownership and approval at order creation/fulfillment; handle transfers and races.
6. **Approvals:** request the narrowest supported approval; explain token/operator and scope. Never request blanket approvals without an explicit, justified flow. Provide a route to revoke approvals.
7. **External links:** use HTTPS and `rel="noopener noreferrer"`; disclose leaving evm.market.
8. **Server/API:** keep Alchemy/OpenSea/Rarible credentials in Cloudflare secrets; never embed keys in browser code or commit them. Validate inputs and allowlist contracts. Treat provider metadata as untrusted display data, never transaction authority.
9. **Failures:** fail closed. If chain, ownership, order data, provider status or signature validation is uncertain, do not submit a transaction. Do not claim a listing or sale succeeded without a confirmed transaction/order result.
10. **Testing/release:** test chain mismatch, rejected wallet prompts, account changes, stale ownership, malformed token IDs, expired/changed orders, wrong collection, unsupported currency, insufficient funds, approval denial, RPC/provider failure and transaction reverts on Base test infrastructure before enabling native trading.

## Implementation status

- Existing UI: wallet connection/Base switching, contract allowlist, owner-read helper. Trade buttons still link to an external marketplace.
- Added on branch `feat/seaport-native-trading-foundation`: `functions/api/trade.js`, a server-side OpenSea API wrapper constrained to Base and the two collection contracts. It validates request methods, same-origin browser requests, token IDs, requested NFT in the correct order side, presence of payment/consideration items, offerer address, protocol address format, and signature format. API credentials are read only from Cloudflare environment secrets.
- **Not yet implemented:** frontend SDK/bundling, EIP-712 order construction/signing, complete validation of Seaport order semantics and fees, fulfillment transaction generation/submission, cancellation, approval flows, transaction/order persistence, status tracking, and end-to-end tests. Therefore native trading remains disabled and the UI must not be changed to imply these operations work yet.

## API foundation

- `GET /api/trade?action=listings&contract=<allowlisted-address>&tokenId=<decimal-id>`
- `GET /api/trade?action=offers&contract=<allowlisted-address>&tokenId=<decimal-id>`
- `POST /api/trade?action=post-listing&contract=<allowlisted-address>&tokenId=<decimal-id>`
- `POST /api/trade?action=post-offer&contract=<allowlisted-address>&tokenId=<decimal-id>`

POST bodies must contain the signed Seaport order's `parameters`, `protocol_address`, and `signature`. The route does not sign orders or send blockchain transactions. Test the exact OpenSea API schema and Base support before relying on it; configure `OPENSEA_API` or `OPENSEA_API_KEY` as a Cloudflare Pages secret. Write endpoints also require `BASE_SEAPORT_ADDRESS` to be set to the verified Seaport contract address on Base; they fail closed if it is absent or mismatched.
