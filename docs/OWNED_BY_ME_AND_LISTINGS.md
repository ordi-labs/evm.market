# Owned by me and listing visibility

The `Owned by me` view calls `/api/owned` for the selected allowlisted collection and connected wallet. Alchemy finds candidate token IDs; the endpoint verifies the configured RPC's chain ID and calls ERC-721 `ownerOf(uint256)` for each candidate. Base collections require Base mainnet (chain ID 8453); NodeMonkes [Polygon] requires Polygon mainnet (chain ID 137). Only NFTs whose current on-chain owner matches the wallet are returned. Failed or stale indexer candidates are never shown as owned.

For Base Punks, NodeMonkes, BYTEBEASTS, and CryptoPunks [Base], the trait indexer walks the OpenSea contract NFT cursor in 50-NFT pages until the feed is exhausted. NodeMonkes [Polygon] uses the Alchemy Polygon contract NFT feed and its own cursor format; it does not depend on an unverified OpenSea collection slug. The browser stores per-NFT metadata and the pagination cursor in IndexedDB, resumes interrupted scans, and reports progress. Trait selectors remain disabled until exactly 10,000 unique NFTs have been indexed; if a provider returns fewer, the UI reports incomplete coverage rather than presenting partial results as exhaustive. Trait counts and percentages are calculated over the complete collection, while search, trait matching, sorting, and result pagination run locally across the indexed collection.

Collection-wide listing visibility uses OpenSea for Base collections with verified slugs and Rarible for NodeMonkes [Polygon]. The Polygon route requires the server-side `RARIBLE_API_KEY`, keeps only active orders whose NFT contract matches the allowlisted contract, and exposes the listing as marketplace data for filtering and sorting; purchase execution still remains outside the app on Rarible. Polygon Seaport creation actions use OpenSea's API separately and require user wallet confirmation.

Listing prices are parsed from the OpenSea price object's own `decimals` field, with network-aware ETH/WETH or POL/MATIC/WETH normalization where appropriate. Positive low-priced listings are not subject to a USD threshold. Active listings with an unfamiliar price representation remain marked as listed, with the price shown as unavailable rather than silently excluded.

## API references

OpenSea documents collection NFT filtering with a JSON `traits` query and best-listings feeds in [Get NFTs by collection](https://docs.opensea.io/reference/get_nfts_by_collection) and [Get best listings by collection](https://docs.opensea.io/reference/get_best_listings_collection). Alchemy documents owner retrieval, contract filters and `pageKey` pagination for [NFTs by owner](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3) and [NFTs by contract](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-contract-endpoints/get-nf-ts-for-contract-v-3). The indexer finds candidates; on-chain `ownerOf` remains the ownership check.


## Wallet connection and live marketplace table

The wallet modal uses Reown AppKit with WalletConnect and declares Base and Polygon; injected providers are disabled to match the app's connection flow. The application metadata URL follows the active site origin. `Owned by me` remains wallet- and chain-scoped, and the server verifies candidate owners with `ownerOf` before returning NFTs.

The selected collection has a live listings table. Base feeds use paginated OpenSea collection best listings (Seaport), and NodeMonkes [Polygon] uses its active Rarible collection feed. Prices that cannot be safely interpreted remain explicitly unavailable. Listing creation and cancellation remain disabled for NodeMonkes [Polygon]; the table is read-only and links out to the corresponding marketplace.
