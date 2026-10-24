# OpenSea MCP — configuration sécurisée

Ce dépôt utilise déjà `OPENSEA_API` côté serveur Cloudflare Pages pour l'API REST OpenSea. Le fichier `.cursor/mcp.json` configure le client MCP OpenSea pour les développeurs qui utilisent Cursor.

## Configuration

1. Définir la variable d'environnement locale `OPENSEA_API` avec la clé OpenSea dans le terminal/environnement qui lance Cursor. Ne pas mettre la valeur dans ce dépôt.
2. Redémarrer ou recharger Cursor, puis ouvrir **Settings → MCP** et vérifier que le serveur **OpenSea** est connecté.
3. Tester d'abord un outil de lecture/données publiques. Les outils liés à un portefeuille nécessitent également une authentification OAuth/wallet JWT et les scopes correspondants.

Endpoint MCP : `https://mcp.opensea.io/mcp` (Streamable HTTP).

## Sécurité

- Ne jamais remplacer `${env:OPENSEA_API}` par la clé réelle dans un fichier suivi par Git.
- Ne pas exposer `OPENSEA_API` dans le code du navigateur, les logs ou les commits.
- Le secret Cloudflare Pages n'est pas automatiquement accessible à Cursor sur la machine locale : la variable locale doit être définie séparément dans le gestionnaire de secrets de l'environnement de développement.
- Cette configuration est un **client MCP de développement**. Elle ne déploie pas un serveur MCP et ne change pas les endpoints REST existants du site.
- Pour les appels MCP data, OpenSea utilise `X-API-KEY`. Les outils de portefeuille exigent en plus `Authorization: Bearer <wallet JWT>`; ne pas placer de PAT ou de clé privée dans cette configuration.

Référence officielle : https://docs.opensea.io/reference/auth#mcp
