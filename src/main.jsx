import './polyfills.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base, polygon } from '@reown/appkit/networks'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { verifyMessage } from 'ethers'

const projectId = 'f981fcdc036a0a273c655b90030221e4'
const networks = [base, polygon]
const queryClient = new QueryClient()
const appUrl = window.location.origin
const metadata = {
  name: 'evm.market',
  description: 'Verified NFT marketplace for Base and Polygon',
  url: appUrl,
  icons: [`${appUrl}/icons/icon.svg`]
}

// WagmiAdapter is Reown's complete EVM path: WalletConnect, mobile wallet discovery,
// typed EVM clients and a stable EIP-1193 provider for the existing marketplace flow.
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false
})

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: base,
  projectId,
  metadata,
  // Keep the site's explicit WalletConnect flow; do not expose arbitrary injected providers.
  enableInjected: false,
  // Keep the full WalletConnect wallet directory available, especially on mobile.
  allWallets: 'ONLY_MOBILE',
  features: {
    analytics: true,
    allWallets: true,
    connectMethodsOrder: ['wallet'],
    emailCapture: false,
    socials: false,
    swaps: false,
    onramp: false
  }
})

window.__reownAppKit = appKit
window.__verifyMessage = verifyMessage

function AppKitBridge({ children }) {
  return children
}

createRoot(document.getElementById('appkit-root')).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppKitBridge />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
