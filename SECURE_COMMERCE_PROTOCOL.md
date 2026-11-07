# Commerce sécurisé — evm.market

## Portée

evm.market utilise OpenSea et le protocole Seaport sur Base mainnet (`chainId 8453 / 0x2105`) pour les NFT des contrats autorisés Base Punks (`0xb9110ba3266f4983193c0d5f55c792a94368af28`), NodeMonkes (`0x095b6ae2102094be8b5f06fac27275ddb9a8c70a`) et BYTEBEASTS (`0x7325654c657520e30c56a04225a3d9acdf895e55`) ainsi que CryptoPunks [Base] (`0x18d91b5597f1a7227d2960945c9a1417f0ff721d`). Le site interroge le meilleur listing et la meilleure offre OpenSea pour le NFT consulté; ce n’est pas un relevé exhaustif de tous les ordres d’une collection. Rarible n’est pas intégré.

La clé d’API OpenSea (`OPENSEA_API_KEY`) reste côté Cloudflare Pages Functions. Elle permet les appels de service; elle n’est ni un portefeuille ni une signature. Les transactions nécessitent toujours la confirmation et la signature du portefeuille de l’utilisateur. Aucun secret ni private key utilisateur n’est transmis au serveur.

## Parcours OpenSea pris en charge

- **Acheter** : le site demande à OpenSea les données de fulfillment du meilleur listing disponible pour ce NFT. L’utilisateur examine et soumet la transaction Base dans son portefeuille; le site attend le reçu avant d’afficher une confirmation.
- **Lister / vendre** : après une vérification on-chain du propriétaire, l’utilisateur saisit un prix en ETH. Le listing OpenSea reçoit une date d’expiration explicite à six mois calendaires maximum. Les paiements sont limités à l’ETH/WETH attendu, le maker doit recevoir une part positive et les destinataires/montants fournis par OpenSea sont affichés avant la signature typed-data dans le portefeuille. La publication de l’ordre ne transfère pas le NFT; le transfert n’arrive que si un acheteur remplit ensuite l’ordre.
- **Placer une offre** : offre individuelle pour un NFT, libellée en WETH canonique Base (`0x4200000000000000000000000000000000000006`), avec une expiration d’un mois. Le portefeuille peut demander une approbation WETH puis une signature de l’ordre. L’utilisateur doit disposer des WETH nécessaires.
- **Retirer un listing ou une offre créés depuis ce navigateur** : le hash de l’ordre est conservé localement dans le navigateur, rattaché à l’adresse du portefeuille créateur. Après rechargement de la page, le portefeuille maker peut demander les actions d’annulation on-chain OpenSea et confirmer la transaction Base (frais de réseau possibles). Le site vérifie auprès d’OpenSea que le hash correspond au NFT, au protocole Base, à un ordre actif et au maker connecté. L’ordre reste actif jusqu’à confirmation de l’annulation. Les ordres créés ailleurs ou sur un autre navigateur ne sont pas listés par ce contrôle local.

La date maximale d’expiration d’un ordre signé est également contrôlée côté serveur : six mois pour les listings et un mois pour les offres. Les requêtes de création et les ordres signés sont liés au contrat/token autorisés, à Seaport 1.6 canonique, au montant et à la devise saisis; les paiements supplémentaires ou devises inattendues sont rejetés. Si le format retourné par OpenSea ne peut pas être validé de manière sûre, le flux s’arrête.

## Sécurité et limites

1. Le portefeuille doit être sur Base juste avant chaque signature ou transaction; le site vérifie aussi l’adresse maker et, avant signature, le chain ID et le contrat Seaport du typed-data.
2. Les contrats NFT sont limités à l’allowlist ci-dessus. Les IDs de token sont des entiers décimaux; la validation d’existence et de disponibilité dépend également des réponses du contrat et d’OpenSea.
3. Les appels API, la préparation d’un ordre, une signature d’ordre et une transaction de règlement sont des étapes distinctes. Une réponse API ou une signature seule n’est pas une vente ni un transfert confirmé.
4. Toute transaction d’approbation, d’achat ou d’annulation doit être examinée puis autorisée dans le portefeuille de l’utilisateur. Les approbations peuvent autoriser un opérateur de transfert; l’utilisateur doit vérifier leur portée dans son portefeuille. Le site ne détient aucune clé privée et n’envoie aucun ordre en signant à la place de l’utilisateur.
5. L’annulation actuellement proposée est on-chain, pas une annulation off-chain SignedZone. Elle peut coûter du gas et ne prend effet qu’après confirmation sur Base.
6. `BASE_SEAPORT_ADDRESS` n’est pas un secret requis : le serveur connaît l’adresse Seaport 1.6 canonique d’OpenSea pour les chaînes EVM et rejette un override qui ne correspond pas à cette adresse. Source : https://raw.githubusercontent.com/ProjectOpenSea/seaport/main/docs/Deployment.md.
7. Les données live affichées sont les meilleurs ordres OpenSea du NFT consulté. Les limites de taux et erreurs OpenSea sont possibles; un statut indisponible ne prouve pas qu’aucun ordre n’existe.

## Routes OpenSea côté serveur

- Lecture : `GET /api/trade?action=listings&contract=<contrat-autorisé>&tokenId=<id>` et `action=offers` renvoient le meilleur ordre du NFT.
- Création de listing : `POST /api/trade?action=listing-actions...`, puis `action=post-listing` après signature du portefeuille.
- Création d’offre : `POST /api/trade?action=offer-actions...`, puis `action=post-offer` après signature du portefeuille.
- Achat : `POST /api/trade?action=fulfill-listing...` renvoie les données de transaction sans les exécuter.
- Annulation : `POST /api/trade?action=cancel-actions...` vérifie d’abord l’ordre auprès d’OpenSea et retourne les actions; le navigateur demande ensuite au portefeuille d’émettre la transaction.

Références officielles : listing actions https://docs.opensea.io/reference/create_listing_actions ; offer actions https://docs.opensea.io/reference/create_offer_actions.md ; lecture d’ordre https://docs.opensea.io/reference/get_order ; annulation on-chain https://docs.opensea.io/reference/create_cancel_order_actions ; fulfillment https://docs.opensea.io/reference/post_listing.