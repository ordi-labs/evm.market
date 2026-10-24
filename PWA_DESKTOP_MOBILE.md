# evm.market desktop and mobile app

## Delivery model

This change adds an installable Progressive Web App (PWA) to the existing site. It reuses the same site, collections, wallet flow and marketplace links instead of maintaining a separate fork.

## Install

- **Desktop (Chrome/Edge):** open the deployed HTTPS site and choose the install icon in the address bar or the site's Install app button when offered.
- **Android:** open the site in a supported browser and choose Install app / Add to Home screen.
- **iPhone/iPad:** open the site in Safari, tap Share, then Add to Home Screen. iOS does not expose the same `beforeinstallprompt` flow as Chromium browsers, so use the browser menu.
- **Offline:** the service worker caches the app shell. Live collection/API data and wallet actions still require network access; cached HTML does not make trading work offline.

## Files

- `manifest.webmanifest`: app identity, standalone display and theme.
- `sw.js`: versioned app-shell cache and navigation fallback. It does not cache cross-origin APIs or non-GET requests.
- `icons/icon.svg`: app icon.
- `index.html`: mobile-web-app metadata, install affordance and service-worker registration.

## Important limits

This is a PWA, not yet a signed Windows/macOS installer or a store-published native Android/iOS package. A valid HTTPS deployment is required for service workers. Wallet providers may behave differently in standalone/mobile browser contexts; verify wallet connection, account/network changes and external marketplace hand-offs on each target device before release. Buy/offer/list actions remain external marketplace links and are not implemented as native in-app smart-contract execution.
