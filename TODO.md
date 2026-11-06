# TODO

- [x] Dans les collections Base Punks et NodeMonkes, le filtre de traits charge les options à l’échelle de la collection, reconnaît les alias d’attributs et n’affiche pas de faux résultats sans correspondance exacte.
- [x] Ajouter « Owned by me » aux trois collections Base Punks, NodeMonkes et BYTEBEASTS pour le wallet connecté; paginer l’inventaire et n’afficher un NFT que si son `ownerOf` actuel sur Base correspond à l’adresse du wallet.
- [x] Afficher aussi les NFT listés à bas prix: ne pas appliquer de seuil de 50 USD, normaliser les prix par leurs décimales ETH/WETH et conserver la mention « Listed » même si le prix fourni par le marché n’est pas interprétable.
- [x] Mettre à jour le shell PWA afin que l’interface et son nouveau module de prix ne restent pas bloqués dans l’ancien cache.
- [x] Pour Base Punks, NodeMonkes et BYTEBEASTS, parcourir les pages OpenSea de la collection par lots de 50 jusqu’à épuisement du curseur; n’activer les filtres exacts qu’après comparaison des 10 000 NFT; calculer les fréquences et pourcentages sur la collection complète; filtrer localement tout l’index avec pagination d’affichage; sauvegarder et reprendre le scan dans IndexedDB; signaler clairement un scan incomplet et ne pas prétendre que les résultats sont exhaustifs.
- [x] Le site détecte et affiche les NFT listés à moins de 50 USD dès leur premier rendu; les prix OpenSea positifs en ETH/WETH ne sont pas écartés par un seuil de prix et le statut d’annonce se met à jour sans devoir provoquer un second rendu.
- [x] Utiliser exclusivement le secret serveur `OPENSEA_API_KEY` pour les lectures et transactions OpenSea; ne jamais exposer la clé au navigateur.
- [x] Faire passer les connexions et toutes les transactions de marché par WalletConnect/Reown avec le Project ID fourni; supprimer les options MetaMask et autres providers injectés.
- [x] Activer et conserver les flux sécurisés list, buy, bid/offer et unlist/cancel, avec confirmation explicite dans le wallet et validation Base/Seaport côté serveur.
