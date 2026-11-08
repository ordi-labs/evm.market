# TODO

- [x] Dans les collections Base Punks et NodeMonkes, le filtre de traits charge les options à l’échelle de la collection, reconnaît les alias d’attributs et n’affiche pas de faux résultats sans correspondance exacte.
- [x] Ajouter « Owned by me » aux quatre collections Base Punks, NodeMonkes, BYTEBEASTS et CryptoPunks [Base] pour le wallet connecté; paginer l’inventaire et n’afficher un NFT que si son `ownerOf` actuel sur Base correspond à l’adresse du wallet.
- [x] Afficher aussi les NFT listés à bas prix: ne pas appliquer de seuil de 50 USD, normaliser les prix par leurs décimales ETH/WETH et conserver la mention « Listed » même si le prix fourni par le marché n’est pas interprétable.
- [x] Mettre à jour le shell PWA afin que l’interface et son nouveau module de prix ne restent pas bloqués dans l’ancien cache.
- [x] Pour Base Punks, NodeMonkes, BYTEBEASTS et CryptoPunks [Base], parcourir les pages OpenSea de la collection par lots de 50 jusqu’à épuisement du curseur; n’activer les filtres exacts qu’après comparaison des 10 000 NFT; calculer les fréquences et pourcentages sur la collection complète; filtrer localement tout l’index avec pagination d’affichage; sauvegarder et reprendre le scan dans IndexedDB; signaler clairement un scan incomplet et ne pas prétendre que les résultats sont exhaustifs.
- [x] Le site détecte et affiche les NFT listés à moins de 50 USD dès leur premier rendu; les prix OpenSea positifs en ETH/WETH ne sont pas écartés par un seuil de prix et le statut d’annonce se met à jour sans devoir provoquer un second rendu.
- [x] Utiliser exclusivement le secret serveur `OPENSEA_API_KEY` pour les lectures et transactions OpenSea; ne jamais exposer la clé au navigateur.
- [x] Faire passer les connexions et toutes les transactions de marché par WalletConnect/Reown avec le Project ID fourni; supprimer les options MetaMask et autres providers injectés.
- [x] Activer et conserver les flux sécurisés list, buy, bid/offer et unlist/cancel, avec confirmation explicite dans le wallet et validation Base/Seaport côté serveur.

- [x] Ajouter NodeMonkes [Polygon] (`0xdf264d5da8dfaa41fa2e634afead44935af2ad66`) au sélecteur; indexer ses NFTs/traits via Alchemy Polygon; vérifier `ownerOf` sur chain ID 137; relier chaque NFT et la collection à Rarible.
- [x] Ajouter les parcours Seaport 1.6 dédiés à Polygon (chain ID 137, POL/MATIC ou Polygon WETH pour les listings, Polygon WETH pour les offres), avec garde-fous serveur et signature/transactions toujours soumises au portefeuille.
- [x] Rendre explicite que l’app ne lit pas les ordres Rarible et n’invente pas de slug OpenSea pour le carnet de listings Polygon; bump du cache shell PWA pour le nouveau sélecteur et les routes Polygon.
