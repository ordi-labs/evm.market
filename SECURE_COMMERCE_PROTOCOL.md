# Secure commerce protocol — evm.market

## Scope and current trading model

evm.market is a collection explorer for Base Punks (`0xb9110ba3266f4983193c0d5f55c792a94368af28`) and NodeMonkes (`0x095b6ae2102094be8b5f06fac27275ddb9a8c70a`). The current app links to an external marketplace; it does **not** create, sign, fulfill, or cancel orders itself. The app must not represent an external link as an in-app purchase or claim that an order is verified merely because a wallet is connected.

Use established, audited marketplace infrastructure (for example, the marketplace's supported Seaport flow on Base) rather than deploying a custom unaudited exchange contract.

## Required security invariants

1. **Network:** Base mainnet only (`chainId 8453 / 0x2105`) for this site's collection actions. Re-check the chain immediately before any future signing or transaction request.
2. **Collection allowlist:** only the two contract addresses above are supported. Never trust a contract address supplied by a query string or external marketplace metadata without comparing it to the allowlist.
3. **Wallet safety:** never request seed phrases or private keys; never send them to a server. All future order signatures and transactions must be initiated in the user's wallet after explicit action.
4. **Clear transaction review:** before a future signature/transaction, display and validate collection, token ID, maker/taker, recipient, payment token, total price, fees, expiration, nonce/order hash, conduit/operator and approval scope. Reject unsupported currencies, unexpected recipients, expired orders and mismatched chain IDs.
5. **Ownership:** an owner read is only a point-in-time eligibility hint. Re-check on-chain ownership and approval at order creation/fulfillment; handle transfers and race conditions.
6. **Approvals:** request the narrowest supported approval; explain token/operator and scope. Never request blanket approvals without an explicit, justified flow. Provide a route to revoke approvals and explain that revocation is an on-chain transaction.
7. **External links:** use HTTPS and `rel="noopener noreferrer"`; identify that the user is leaving evm.market. Review every external wallet prompt independently. The external marketplace remains responsible for its order validation and execution.
8. **Server/API:** keep Alchemy/OpenSea/Rarible API credentials server-side in Cloudflare secrets; never embed keys in browser code or commit them. Validate all query inputs and allowlist contracts. Treat provider metadata, names, image URLs and traits as untrusted display data, never transaction authority.
9. **Failures:** fail closed. If chain, ownership, order data, provider status or signature validation is uncertain, do not submit a transaction. Do not claim a listing or sale succeeded without a confirmed transaction/order result.
10. **Testing/release:** test chain mismatch, rejected wallet prompts, account changes, stale ownership, malformed token IDs, expired/changed orders, wrong collection, unsupported currency, insufficient funds, approval denial, RPC/provider failure and transaction reverts on Base test infrastructure before enabling native trading.

## Implementation status

- Implemented in the UI: each displayed NFT gets its own action area. Disconnected or non-Base wallets see a Connect eligible wallet control. Connected Base wallets see Buy and Make offer links to the external marketplace. Sell and List NFT links appear only after the wallet's address is verified as the current owner by an on-chain `ownerOf` read; if that read fails, these actions remain hidden. Account changes clear the ownership cache and re-check the chain. All trade links remain external and the UI warns users to inspect transaction details and never share recovery phrases.
- Already present: two-contract allowlist in NFT API routes, server-side provider credentials, Base chain switching, wallet-side connection and owner-read helper.
- Not yet implemented: a marketplace smart contract deployment or native Seaport order creation, EIP-712 order signing, offers, fulfillment, cancellation, on-chain approval flows, order persistence/indexing, order status verification, or an audited end-to-end transaction test suite. The visible Buy/Make offer/Sell/List links open the external marketplace and do not themselves execute those operations. Native trading must remain disabled until a reviewed Seaport integration and end-to-end tests are complete.
