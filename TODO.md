# TODO

- [x] Dans les collections Base Punks et NodeMonkes, le filtre de traits charge les options à l’échelle de la collection, reconnaît les alias d’attributs et n’affiche pas de faux résultats sans correspondance exacte.
- [x] Ajouter « Owned by me » aux trois collections Base Punks, NodeMonkes et BYTEBEASTS pour le wallet connecté; paginer l’inventaire et n’afficher un NFT que si son `ownerOf` actuel sur Base correspond à l’adresse du wallet.
- [x] Afficher aussi les NFT listés à bas prix: ne pas appliquer de seuil de 50 USD, normaliser les prix par leurs décimales ETH/WETH et conserver la mention « Listed » même si le prix fourni par le marché n’est pas interprétable.
- [x] Mettre à jour le shell PWA afin que l’interface et son nouveau module de prix ne restent pas bloqués dans l’ancien cache.
- [x] Pour Base Punks, NodeMonkes et BYTEBEASTS, parcourir les pages OpenSea de la collection par lots de 50 jusqu’à épuisement du curseur; n’activer les filtres exacts qu’après comparaison des 10 000 NFT; calculer les fréquences et pourcentages sur la collection complète; filtrer localement tout l’index avec pagination d’affichage; sauvegarder et reprendre le scan dans IndexedDB; signaler clairement un scan incomplet et ne pas prétendre que les résultats sont exhaustifs.
