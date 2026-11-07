# Owned by me and listing visibility

The `Owned by me` view calls `/api/owned` for the selected allowlisted Base collection and connected wallet. Alchemy is used only to find candidate token IDs. The endpoint checks the configured RPC chain ID is Base mainnet, calls ERC-721 `ownerOf(uint256)` for each candidate, and includes only tokens whose current on-chain owner matches the requested wallet. Failed or stale indexer candidates are never shown as owned.

For Base Punks, NodeMonkes, BYTEBEASTS, and CryptoPunks [Base], the trait indexer walks the OpenSea contract NFT cursor in 50-NFT pages until the feed is exhausted. It stores the per-NFT metadata and cursor in browser IndexedDB, resumes interrupted scans, and reports scan progress. Trait selectors remain disabled until exactly 10,000 unique NFTs have been indexed; if the provider returns fewer, the UI reports incomplete coverage rather than presenting partial results as exhaustive. Trait value counts and percentages are calculated over the complete collection, while search, trait matching, sorting, and result pagination run locally across all 10,000 indexed NFTs in each collection.

Listing prices are parsed from the OpenSea price object's own `decimals` field, with Base ETH/WETH defaults where appropriate. Positive low-priced listings are not subject to a USD threshold. Active listings with an unfamiliar price representation remain marked as listed, with the price shown as unavailable rather than silently excluded.

## API references

OpenSea documents collection NFT filtering with a JSON `traits` query and its best-listings feed as sorted by price ascending: [Get NFTs by collection](https://docs.opensea.io/reference/get_nfts_by_collection) and [Get best listings by collection](https://docs.opensea.io/reference/get_best_listings_collection). Alchemy documents owner-based retrieval, contract filters, `pageKey` pagination, and Base support in [NFTs by owner](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3). The Alchemy index is used to find candidates; `ownerOf` remains the actual ownership check.
