# Commerce sécurisé — evm.market

## Portée

Les quatre collections Base utilisent OpenSea et Seaport 1.6 sur Base mainnet (chain ID `8453` / `0x2105`) : Base Punks (`0xb9110ba3266f4983193c0d5f55c792a94368af28`), NodeMonkes (`0x095b6ae2102094be8b5f06fac27275ddb9a8c70a`), BYTEBEASTS (`0x7325654c657520e30c56a04225a3d9acdf895e55`) et CryptoPunks [Base] (`0x18d91b5597f1a7227d2960945c9a1417f0ff721d`). NodeMonkes [Polygon] (`0xdf264d5da8dfaa41fa2e634afead44935af2ad66`) utilise Seaport 1.6 sur Polygon mainnet (chain ID `137` / `0x89`). Les contrats, réseaux, devises et protocoles sont allowlistés séparément.

Le contrat Polygon est présenté via Rarible (`og.rarible.com`). Le site lit désormais les listings actifs de la collection via l’API Rarible quand `RARIBLE_API_KEY` est configurée côté serveur; ces données servent au statut, au filtre et au tri, tandis que l’achat reste un parcours externe Rarible. Aucun slug OpenSea n’étant vérifié pour cette collection, l’application ne prétend pas fournir un carnet OpenSea Polygon. La création de listings/offres Seaport OpenSea est un parcours distinct et reste conditionnée au support de l’API OpenSea pour le token.

La clé `OPENSEA_API_KEY` reste côté Cloudflare Pages Functions. Elle permet les appels de service; elle n’est ni un portefeuille ni une signature. Les transactions nécessitent toujours l’approbation explicite du portefeuille de l’utilisateur. Aucun secret ni private key utilisateur n’est transmis au serveur.

## Parcours Seaport pris en charge

- **Acheter** : le site demande à OpenSea les données de fulfillment d’un ordre Seaport actif pour le NFT sélectionné. Si aucune listing OpenSea compatible n’est retournée, aucune transaction n’est envoyée et l’utilisateur est invité à consulter Rarible. Les acquisitions in-app n’acceptent que le paiement natif (ETH sur Base, POL/MATIC sur Polygon); les ordres WETH sont orientés vers la marketplace externe. Le portefeuille affiche et soumet la transaction, puis le site attend le reçu sur la chaîne attendue.
- **Lister / vendre** : après vérification on-chain du propriétaire, l’utilisateur saisit un prix en ETH sur Base ou POL/MATIC sur Polygon. Un listing expire au plus tard six mois calendaires après sa création. Le paiement doit être dans la devise native autorisée ou le WETH canonique du réseau. Le maker doit recevoir une part positive; les destinataires et montants du listing sont présentés avant la signature. La publication de l’ordre ne transfère pas le NFT; le transfert se produit uniquement si un acheteur le remplit.
- **Placer une offre** : offre individuelle libellée en WETH canonique Base (`0x4200000000000000000000000000000000000006`) ou Polygon (`0x7ceb23fd6bc0add59e62ac25578270cff1b9f619`). Une offre expire au plus tard un mois après sa création. Le portefeuille peut demander une approbation WETH puis une signature typed-data.
- **Retirer un listing ou une offre créée depuis ce navigateur** : le hash de l’ordre est conservé localement et rattaché au portefeuille maker. Le site vérifie auprès d’OpenSea la chaîne, le hash, le NFT, le protocole et le maker; le portefeuille doit soumettre l’annulation on-chain. L’ordre reste actif jusqu’à confirmation sur Base ou Polygon. Les ordres créés ailleurs ou sur un autre navigateur ne sont pas affichés dans ce contrôle local.

La date maximale d’expiration, la chaîne, le contrat/token autorisé, le Seaport canonique, le montant et la devise sont vérifiés côté serveur. Les paiements additionnels ou devises inattendues sont rejetés. Si les données fournies par OpenSea ne peuvent pas être validées, le flux s’arrête.

## Sécurité et limites

1. Avant chaque signature ou transaction, le portefeuille doit être sur la chaîne liée à la collection : Base (8453) ou Polygon (137). Une action de marché Polygon peut proposer un changement de réseau; l’interface demande d’abord confirmation et le portefeuille doit ensuite autoriser ce changement. La connexion de session peut également demander Base pour signer le message unique de vérification.
2. Les contrats NFT sont limités à l’allowlist ci-dessus. L’API d’inventaire utilise Alchemy pour découvrir des candidats, puis vérifie le propriétaire avec `ownerOf(uint256)` sur le RPC dont le chain ID doit correspondre à la collection; les candidats périmés ne sont jamais présentés comme propriété confirmée.
3. Les appels API, la préparation d’un ordre, une signature d’ordre et une transaction de règlement sont des étapes distinctes. Une réponse API ou une signature seule n’est pas une vente ni un transfert confirmé.
4. Toute transaction d’approbation, d’achat ou d’annulation doit être examinée puis autorisée dans le portefeuille. Les approbations peuvent autoriser un opérateur de transfert; l’utilisateur doit en vérifier la portée. Le site ne détient aucune clé privée et n’émet aucune transaction à la place de l’utilisateur.
5. Les proxys `/api/rpc` et `/api/polygon-rpc` sont limités aux méthodes nécessaires. Le proxy Base n’autorise la diffusion de transactions signées que dans son parcours distinct, après contrôle Base; le proxy Polygon est exclusivement en lecture et bloque les méthodes d’écriture.
6. L’annulation proposée est on-chain, pas une annulation off-chain SignedZone. Elle peut coûter du gas et ne prend effet qu’après confirmation sur la chaîne correspondante.
7. Seaport 1.6 canonique : `0x0000000000000068f116a894984e2db1123eb395` sur les deux réseaux; les overrides `BASE_SEAPORT_ADDRESS` et `POLYGON_SEAPORT_ADDRESS`, s’ils sont définis, doivent correspondre à cette adresse. Source : https://raw.githubusercontent.com/ProjectOpenSea/seaport/main/docs/Deployment.md.
8. Les ordres live dépendent des réponses et limites de taux de l’API OpenSea. Une réponse vide ou indisponible ne prouve pas qu’aucun ordre n’existe sur un marché externe, notamment Rarible.

## Routes OpenSea côté serveur

- Lecture d’ordres : `GET /api/trade?action=listings|offers&contract=<contrat-autorisé>&tokenId=<id>` renvoie les ordres OpenSea disponibles pour les collections indexées par slug; le contrat Polygon Rarible-only renvoie un état indisponible plutôt qu’un slug inventé.
- Création d’un listing : `POST /api/trade?action=listing-actions...`, puis `action=post-listing` après signature du portefeuille.
- Création d’une offre : `POST /api/trade?action=offer-actions...`, puis `action=post-offer` après signature du portefeuille.
- Achat : `POST /api/trade?action=fulfill-listing...` prépare les données de transaction sans les exécuter.
- Annulation : `POST /api/trade?action=cancel-actions...` vérifie d’abord l’ordre auprès d’OpenSea et retourne les actions; le navigateur demande ensuite au portefeuille d’émettre la transaction.

Références officielles : [Seaport deployments](https://raw.githubusercontent.com/ProjectOpenSea/seaport/main/docs/Deployment.md), [OpenSea listing actions](https://docs.opensea.io/reference/create_listing_actions), [offer actions](https://docs.opensea.io/reference/create_offer_actions.md), [read orders](https://docs.opensea.io/reference/get_order), [cancel actions](https://docs.opensea.io/reference/create_cancel_order_actions), [fulfillment](https://docs.opensea.io/reference/post_listing).
